from fastapi import Request
from fastapi.responses import JSONResponse


class ProblemException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.title = title
        self.detail = detail


def problem_exception_handler(
    request: Request,
    exc: ProblemException,
) -> JSONResponse:
    body: dict[str, object] = {
        "type": "about:blank",
        "title": exc.title,
        "status": exc.status_code,
        "code": exc.code,
    }

    if exc.detail is not None:
        body["detail"] = exc.detail

    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        media_type="application/problem+json",
    )