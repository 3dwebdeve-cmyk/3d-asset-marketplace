"""Administrator two-factor sign-in: TOTP (RFC 6238) and single-use recovery codes.

The TOTP secret is derived from MFA_SECRET_KEY and a per-user nonce instead of being
stored, so a copy of the database alone cannot generate codes. Sign-in is two steps:
the password step returns a short-lived signed ``mfa_token``, and the code step
exchanges it (plus a valid code) for the session.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from accounts.models import AdminRecoveryCode, User

TOTP_DIGITS = 6
TOTP_PERIOD = 30
# Accept the previous and next 30-second step for clock drift between phone and server.
TOTP_DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 10
MFA_TOKEN_MAX_AGE = 300
ISSUER = "3D Asset Marketplace"
_TOKEN_SALT = "accounts.admin_mfa"
_RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"


class MfaError(Exception):
    pass


# ----- TOTP -----------------------------------------------------------------------


def hotp(secret: bytes, counter: int, digits: int = TOTP_DIGITS) -> str:
    """RFC 4226 HOTP with HMAC-SHA1, as every authenticator app implements it."""
    digest = hmac.new(secret, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10**digits)).zfill(digits)


def current_counter(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // TOTP_PERIOD)


def derive_secret(user: User, nonce: str) -> bytes:
    """20-byte TOTP secret for this user and enrollment nonce."""
    key = str(getattr(settings, "MFA_SECRET_KEY", "") or settings.SECRET_KEY).encode()
    message = f"admin-totp:{user.pk}:{nonce}".encode()
    return hmac.new(key, message, hashlib.sha256).digest()[:20]


def secret_base32(secret: bytes) -> str:
    return base64.b32encode(secret).decode().rstrip("=")


def otpauth_uri(user: User, secret: bytes) -> str:
    label = quote(f"{ISSUER}:{user.email}")
    query = urlencode(
        {
            "secret": secret_base32(secret),
            "issuer": ISSUER,
            "digits": TOTP_DIGITS,
            "period": TOTP_PERIOD,
        }
    )
    return f"otpauth://totp/{label}?{query}"


def _normalize_code(code: str) -> str:
    return "".join(ch for ch in str(code or "") if ch.isdigit())


def match_totp(secret: bytes, code: str, *, after_counter: int, now: float | None = None) -> int | None:
    """Return the matched time step, or None. Steps at or below ``after_counter`` are spent."""
    normalized = _normalize_code(code)
    if len(normalized) != TOTP_DIGITS:
        return None
    center = current_counter(now)
    for counter in range(center - TOTP_DRIFT_STEPS, center + TOTP_DRIFT_STEPS + 1):
        if counter <= after_counter:
            continue
        if hmac.compare_digest(hotp(secret, counter), normalized):
            return counter
    return None


# ----- Recovery codes -----------------------------------------------------------------


def _recovery_hash(user: User, code: str) -> str:
    normalized = "".join(ch for ch in str(code or "").upper() if ch.isalnum())
    key = str(getattr(settings, "MFA_SECRET_KEY", "") or settings.SECRET_KEY).encode()
    return hmac.new(key, f"recovery:{user.pk}:{normalized}".encode(), hashlib.sha256).hexdigest()


def _new_recovery_code() -> str:
    raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
    return f"{raw[:5]}-{raw[5:]}"


def replace_recovery_codes(user: User) -> list[str]:
    """Delete the old codes and return a fresh set (shown once, stored only as hashes)."""
    codes = [_new_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    with transaction.atomic():
        AdminRecoveryCode.objects.filter(user=user).delete()
        AdminRecoveryCode.objects.bulk_create(
            AdminRecoveryCode(user=user, code_hash=_recovery_hash(user, code)) for code in codes
        )
    return codes


def use_recovery_code(user: User, code: str) -> bool:
    with transaction.atomic():
        row = (
            AdminRecoveryCode.objects.select_for_update()
            .filter(user=user, code_hash=_recovery_hash(user, code), used_at__isnull=True)
            .first()
        )
        if row is None:
            return False
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])
    return True


def remaining_recovery_codes(user: User) -> int:
    return AdminRecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# ----- Sign-in token between the password and code steps -------------------------------


def issue_mfa_token(user: User) -> str:
    return signing.dumps({"uid": str(user.pk), "tv": int(user.token_version)}, salt=_TOKEN_SALT)


def user_from_mfa_token(token: str) -> User:
    try:
        payload = signing.loads(str(token or ""), salt=_TOKEN_SALT, max_age=MFA_TOKEN_MAX_AGE)
    except signing.BadSignature as exc:  # Includes SignatureExpired.
        raise MfaError("Your sign-in expired. Enter your email and password again.") from exc
    user = User.objects.select_related("role").filter(pk=payload.get("uid"), is_active=True).first()
    # A password change between the two steps invalidates the pending sign-in.
    if user is None or int(user.token_version) != int(payload.get("tv", -1)):
        raise MfaError("Your sign-in expired. Enter your email and password again.")
    return user


# ----- Enrollment and verification ----------------------------------------------------


def is_enrolled(user: User) -> bool:
    return bool(user.mfa_enabled_at and user.mfa_nonce)


def start_enrollment(user: User) -> tuple[str, str]:
    """Create a pending secret. Returns (base32 secret, otpauth URI)."""
    if is_enrolled(user):
        raise MfaError("Two-factor sign-in is already set up for this account.")
    user.mfa_pending_nonce = secrets.token_hex(16)
    user.save(update_fields=["mfa_pending_nonce", "updated_at"])
    secret = derive_secret(user, user.mfa_pending_nonce)
    return secret_base32(secret), otpauth_uri(user, secret)


def confirm_enrollment(user: User, code: str) -> list[str]:
    """Activate the pending secret when the code matches. Returns new recovery codes."""
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if is_enrolled(locked):
            raise MfaError("Two-factor sign-in is already set up for this account.")
        if not locked.mfa_pending_nonce:
            raise MfaError("Start the setup again.")
        counter = match_totp(
            derive_secret(locked, locked.mfa_pending_nonce), code, after_counter=0
        )
        if counter is None:
            raise MfaError("That code is not valid. Check the time on your phone and try again.")
        locked.mfa_nonce = locked.mfa_pending_nonce
        locked.mfa_pending_nonce = ""
        locked.mfa_enabled_at = timezone.now()
        locked.mfa_last_counter = counter
        locked.save(
            update_fields=[
                "mfa_nonce",
                "mfa_pending_nonce",
                "mfa_enabled_at",
                "mfa_last_counter",
                "updated_at",
            ]
        )
        return replace_recovery_codes(locked)


def verify_second_factor(user: User, *, code: str = "", recovery_code: str = "") -> str:
    """Check a TOTP code or a recovery code. Returns which one was used."""
    if not is_enrolled(user):
        raise MfaError("Two-factor sign-in is not set up for this account.")
    if recovery_code:
        if use_recovery_code(user, recovery_code):
            return "recovery_code"
        raise MfaError("That recovery code is not valid or was already used.")
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        counter = match_totp(
            derive_secret(locked, locked.mfa_nonce), code, after_counter=locked.mfa_last_counter
        )
        if counter is None:
            raise MfaError("That code is not valid. Check the time on your phone and try again.")
        locked.mfa_last_counter = counter
        locked.save(update_fields=["mfa_last_counter", "updated_at"])
    return "totp"


def reset(user: User) -> None:
    """Remove two-factor sign-in so the administrator sets it up again at next sign-in."""
    with transaction.atomic():
        AdminRecoveryCode.objects.filter(user=user).delete()
        user.mfa_nonce = ""
        user.mfa_pending_nonce = ""
        user.mfa_enabled_at = None
        user.mfa_last_counter = 0
        user.token_version = int(user.token_version) + 1  # Sign out every session.
        user.save(
            update_fields=[
                "mfa_nonce",
                "mfa_pending_nonce",
                "mfa_enabled_at",
                "mfa_last_counter",
                "token_version",
                "updated_at",
            ]
        )
