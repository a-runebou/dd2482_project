from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.errors import ProblemException
from app.api.schemas import (
    MagicLinkRequest,
    SessionCreateRequest,
    SessionResponse,
    UserResponse,
)
from app.config import get_settings
from app.infra.db import get_db
from app.services.auth import (
    InvalidMagicLink,
    InvalidRefreshToken,
    create_session,
    logout_session,
    refresh_session,
    request_magic_link,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/magic-link",
    status_code=status.HTTP_202_ACCEPTED,
)
def create_magic_link(
    body: MagicLinkRequest,
    db: Session = Depends(get_db),
) -> Response:
    request_magic_link(
        db=db,
        email=str(body.email),
        redirect_path=body.redirect_path,
    )

    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/session",
    response_model=SessionResponse,
)
def post_session(
    body: SessionCreateRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> SessionResponse:
    settings = get_settings()

    try:
        session = create_session(
            db=db,
            token=body.token,
        )
    except InvalidMagicLink as exc:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
            detail="The magic link is invalid, expired or already used.",
        ) from exc

    response.set_cookie(
        key="refresh_token",
        value=session.refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/api/v1/auth",
    )

    user = session.user

    return SessionResponse(
        access_token=session.access_token,
        expires_in=settings.access_token_ttl_seconds,
        user=UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name or "User",
            timezone=user.timezone,
            created_at=user.created_at,
        ),
    )


@router.post(
    "/refresh",
    response_model=SessionResponse,
)
def post_refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> SessionResponse:
    if refresh_token is None:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        )

    try:
        session = refresh_session(
            db=db,
            raw_token=refresh_token,
        )
    except InvalidRefreshToken as exc:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        ) from exc

    settings = get_settings()

    response.set_cookie(
        key="refresh_token",
        value=session.refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/api/v1/auth",
    )

    user = session.user

    return SessionResponse(
        access_token=session.access_token,
        expires_in=settings.access_token_ttl_seconds,
        user=UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name or "User",
            timezone=user.timezone,
            created_at=user.created_at,
        ),
    )


@router.delete(
    "/session",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_session(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> Response:
    try:
        logout_session(
            db=db,
            raw_token=refresh_token,
        )
    except InvalidRefreshToken as exc:
        raise ProblemException(
            status_code=401,
            code="unauthenticated",
            title="Unauthenticated",
        ) from exc

    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth",
    )

    response.status_code = status.HTTP_204_NO_CONTENT

    return response
