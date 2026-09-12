from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.schemas import MagicLinkRequest
from app.infra.db import get_db
from app.services.auth import request_magic_link

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