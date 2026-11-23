"""A fresh authenticator code before dangerous administrator actions ("step-up").

Signing in proves who the administrator is. A browser left open, or a copied session, can
still do anything that sign-in allows, so the actions that are hard to undo ask again: change
a user's role or status, create a user, delete models for good, publish prices, import a
catalog, change an order's status.

A correct code (``AdminStepUpView``) opens a short window on the administrator's server-side
session, ``UserSession.step_up_until``. The window lives on the session row, not in the JWT,
so a copied access token never carries it and ending the session ends it as well. A view that
needs it answers 403 ``step_up_required`` when the window is closed; the console then asks for
a code and repeats the request.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts import sessions
from accounts.services import AuthenticationService

STEP_UP_REQUIRED_CODE = "step_up_required"


class StepUpRequired(PermissionDenied):
    default_detail = "Enter a code from your authenticator app to continue."
    default_code = STEP_UP_REQUIRED_CODE


def is_required() -> bool:
    return bool(getattr(settings, "ADMIN_STEP_UP_REQUIRED", False))


def window_seconds() -> int:
    return int(getattr(settings, "ADMIN_STEP_UP_MINUTES", 5)) * 60


def session_id(request) -> str | None:
    """The ``sid`` claim of the request's access token, if it has one."""
    token = getattr(request, "auth", None)
    getter = getattr(token, "get", None)
    if not callable(getter):
        # No JWT (an uploader API key, or a test client that skipped authentication).
        return None
    value = getter("sid")
    return str(value) if value else None


def has_recent_step_up(request) -> bool:
    return sessions.has_step_up(session_id(request), request.user)


def require(request) -> None:
    """Raise ``StepUpRequired`` unless this administrator session entered a code recently."""
    if not is_required():
        return
    if not AuthenticationService.is_administrator(request.user):
        # Only administrators reach these views; IsAdministrator turns anyone else away.
        return
    if not has_recent_step_up(request):
        raise StepUpRequired()


def grant(request) -> datetime | None:
    """Open the window on this request's session. None when the session is gone."""
    until = timezone.now() + timedelta(seconds=window_seconds())
    if sessions.grant_step_up(session_id(request), request.user, until=until):
        return until
    return None


class RequiresAdminStepUp(BasePermission):
    """Ask for a fresh authenticator code before the view's dangerous methods run.

    List it after ``IsAdministrator``. Reads (GET, HEAD, OPTIONS) never ask. A view can narrow
    the methods that ask with ``step_up_methods`` (for example ``{"DELETE"}``); without it,
    every unsafe method asks. A view whose need depends on the request body (a PATCH that only
    sometimes changes a role) calls ``step_up.require(request)`` itself instead.
    """

    message = StepUpRequired.default_detail

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        methods = getattr(view, "step_up_methods", None)
        if methods is not None and request.method not in methods:
            return True
        require(request)
        return True
