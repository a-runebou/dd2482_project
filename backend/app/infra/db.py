from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import (
    DeclarativeBase,
    Session,
    sessionmaker,
)

from app.config import get_settings
from app.infra.circuit import (
    CircuitBreaker,
    CircuitOpenError,
)
from app.infra.circuit_alerts import (
    send_circuit_transition_alert,
)

settings = get_settings()


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_timeout=2,
    connect_args={
        "options": "-c statement_timeout=3000"
    },
)


SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autoflush=False,
    expire_on_commit=False,
)


circuit_breaker = CircuitBreaker(
    transition_callback=(
        send_circuit_transition_alert
    )
)


@contextmanager
def guarded_session() -> Generator[
    Session,
    None,
    None,
]:
    circuit_breaker.before_call()

    db = SessionLocal()

    try:
        yield db
    except SQLAlchemyError:
        db.rollback()
        circuit_breaker.record_failure()
        raise
    except Exception:
        db.rollback()
        circuit_breaker.record_success()
        raise
    else:
        circuit_breaker.record_success()
    finally:
        db.close()


def get_db() -> Generator[
    Session,
    None,
    None,
]:
    with guarded_session() as db:
        yield db


def database_ready() -> bool:
    try:
        with guarded_session() as db:
            db.execute(
                text("SELECT 1")
            )
    except (
        CircuitOpenError,
        SQLAlchemyError,
    ):
        return False

    return True