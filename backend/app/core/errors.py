"""Consistent API errors.

Every error response has the shape {"detail": str, "code": str} and optionally
"field" (the offending input) or "errors" (a list of field errors for validation failures).
The frontend translates "code" and falls back to "detail".
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("arabdev")


class AppError(Exception):
    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(
        self,
        detail: str,
        code: str | None = None,
        *,
        field: str | None = None,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.field = field
        self.headers = headers


class BadRequest(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"


class Unauthorized(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "not_authenticated"


class Forbidden(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class NotFound(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class Conflict(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class UnprocessableEntity(AppError):
    status_code = 422
    code = "validation_error"


class TooManyRequests(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"


class ServiceUnavailable(AppError):
    """Something we depend on is down. The request itself was fine: retrying may work."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "service_unavailable"


def _error_body(detail: str, code: str, **extra) -> dict:
    body = {"detail": detail, "code": code}
    body.update({key: value for key, value in extra.items() if value is not None})
    return body


def _clean_message(message: str) -> str:
    for prefix in ("Value error, ", "Assertion failed, "):
        if message.startswith(prefix):
            return message[len(prefix):]
    return message


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.detail, exc.code, field=exc.field),
        headers=exc.headers,
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ()) if part not in ("body", "query", "path")]
        errors.append(
            {
                "field": ".".join(loc) or None,
                "code": err.get("type", "invalid"),
                "message": _clean_message(err.get("msg", "Invalid value")),
            }
        )
    detail = errors[0]["message"] if errors else "Invalid request"
    return JSONResponse(status_code=422, content=_error_body(detail, "validation_error", errors=errors))


async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    codes = {401: "not_authenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}
    code = codes.get(exc.status_code, f"http_{exc.status_code}")
    return JSONResponse(status_code=exc.status_code, content=_error_body(detail, code), headers=exc.headers)


async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=_error_body("Something went wrong on our side. Please try again.", "internal_error"),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)
