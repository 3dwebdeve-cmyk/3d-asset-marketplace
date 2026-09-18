from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, Throttled, ValidationError
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Normalize auth/API errors into consistent, UI-friendly payloads."""
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, Throttled):
        wait = getattr(exc, "wait", None)
        if wait is not None:
            seconds = max(1, int(wait))
            detail = f"Too many attempts. Please try again in {seconds} seconds."
        else:
            detail = "Too many attempts. Please try again later."
        response.data = {
            "detail": detail,
            "code": "throttled",
        }
        response.status_code = status.HTTP_429_TOO_MANY_REQUESTS
        return response

    if isinstance(exc, AuthenticationFailed):
        detail = response.data.get("detail", exc.detail)
        if not isinstance(detail, str):
            detail = "Authentication failed."
        response.data = {
            "detail": detail,
            "code": "authentication_failed",
        }
        return response

    if isinstance(exc, ValidationError) and isinstance(response.data, dict):
        # Keep field errors; add a top-level detail when only non_field_errors exist.
        if "detail" not in response.data and "non_field_errors" in response.data:
            messages = response.data["non_field_errors"]
            if isinstance(messages, list) and messages:
                response.data["detail"] = messages[0]
        response.data.setdefault("code", "validation_error")
        return response

    if isinstance(response.data, dict) and "detail" in response.data:
        default_code = getattr(exc, "default_code", None)
        if isinstance(default_code, str) and default_code:
            response.data.setdefault("code", default_code)
        else:
            response.data.setdefault("code", "error")

    return response
