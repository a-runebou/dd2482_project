from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import ProblemException
from app.domain.auth import (
    AccessTokenExpired,
    InvalidAccessToken,
    decode_access_token,
)
from app.infra.db import get_db
from app.infra.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        )

    try:
        user_id = decode_access_token(credentials.credentials)
    except AccessTokenExpired as exc:
        raise ProblemException(
            status_code=401,
            code="token_expired",
            title="Access token expired",
        ) from exc
    except InvalidAccessToken as exc:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        ) from exc

    user = db.get(User, user_id)

    if user is None:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        )

    return user