from typing import cast

from fastapi import FastAPI, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.types import ExceptionHandler

from app.api.errors import ProblemException, problem_exception_handler
from app.api.router import api_router
from app.infra.db import engine

app = FastAPI(title="Schedular API")
app.include_router(
    api_router,
    prefix="/api/v1"
)

app.add_exception_handler(
    ProblemException,
    cast(ExceptionHandler, problem_exception_handler),
)

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"} 

@app.get("/readyz")
def readyz(response: Response) -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {"status": "ready"}

    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}

