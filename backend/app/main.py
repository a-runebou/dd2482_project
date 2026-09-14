from typing import cast

from fastapi import FastAPI, Response, status
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ExceptionHandler

from app.api.errors import (
    ProblemException,
    circuit_open_exception_handler,
    http_exception_handler,
    problem_exception_handler,
    validation_exception_handler,
)
from app.api.idempotency import IdempotencyMiddleware
from app.api.router import api_router
from app.infra.circuit import CircuitOpenError
from app.infra.db import database_ready

app = FastAPI(title="Schedular API")

app.add_middleware(
    IdempotencyMiddleware,
)

app.include_router(
    api_router,
    prefix="/api/v1",
)

app.add_exception_handler(
    ProblemException,
    cast(ExceptionHandler, problem_exception_handler),
)

app.add_exception_handler(
    RequestValidationError,
    cast(ExceptionHandler, validation_exception_handler),
)

app.add_exception_handler(
    StarletteHTTPException,
    cast(ExceptionHandler, http_exception_handler),
)

app.add_exception_handler(
    CircuitOpenError,
    cast(ExceptionHandler, circuit_open_exception_handler),
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readyz(
    response: Response,
) -> dict[str, str]:
    if not database_ready():
        response.status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE
        )

        return {
            "status": "not_ready",
        }

    return {
        "status": "ready",
    }