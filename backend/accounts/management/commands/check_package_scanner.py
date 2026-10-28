"""Explicit scanner readiness check, separate from application startup."""
import socket
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Require a configured, reachable ClamAV scanner before enabling package uploads."

    def add_arguments(self, parser):
        parser.add_argument("--check-signatures", action="store_true")

    def handle(self, *args, **options):
        host = settings.PACKAGE_SCAN_HOST
        if not host:
            raise CommandError(
                "PACKAGE_SCAN_HOST is not configured. Production package uploads remain blocked."
            )
        try:
            with socket.create_connection((host, settings.PACKAGE_SCAN_PORT), timeout=5) as connection:
                connection.sendall(b"zPING\0")
                response = b""
                while b"\0" not in response and b"\n" not in response and len(response) < 64:
                    chunk = connection.recv(64)
                    if not chunk:
                        break
                    response += chunk
        except OSError as exc:
            raise CommandError("Package scanner is unreachable. Package uploads remain blocked.") from exc
        if response.rstrip(b"\0\n") != b"PONG":
            raise CommandError("Package scanner returned an invalid readiness response.")
        if options["check_signatures"]:
            try:
                with socket.create_connection((host, settings.PACKAGE_SCAN_PORT), timeout=5) as connection:
                    connection.sendall(b"zVERSION\0")
                    response = b""
                    while b"\0" not in response and len(response) < 256:
                        chunk = connection.recv(256)
                        if not chunk:
                            break
                        response += chunk
                version = response.split(b"\0", 1)[0].decode("ascii", "replace")
                updated = parsedate_to_datetime(version.split("/", 2)[2])
                if updated.tzinfo is None:
                    updated = updated.replace(tzinfo=timezone.utc)
                age = datetime.now(timezone.utc) - updated
                max_days = int(getattr(settings, "PACKAGE_SCAN_SIGNATURE_MAX_AGE_DAYS", 3))
                if age < timedelta(0) or age > timedelta(days=max_days):
                    raise ValueError("stale signatures")
            except (OSError, ValueError, IndexError, TypeError) as exc:
                raise CommandError("Scanner signature version is unavailable or stale.") from exc
            self.stdout.write(f"package scanner reachable; signatures age_days={age.days}")
        else:
            self.stdout.write("package scanner reachable; verify signatures and scan limits before release")
