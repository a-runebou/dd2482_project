from fastapi import (
    APIRouter,
    Response,
    status,
)

from app.api.schemas import (
    AnalyticsBatch,
    FlagAssignments,
)

router = APIRouter(
    tags=["meta"],
)


@router.post(
    "/events",
    status_code=status.HTTP_202_ACCEPTED,
)
def ingest_events(
    body: AnalyticsBatch,
) -> Response:
    del body

    return Response(
        status_code=status.HTTP_202_ACCEPTED
    )


@router.get(
    "/flags",
    response_model=FlagAssignments,
)
def get_flags() -> FlagAssignments:
    return FlagAssignments(
        flags={},
    )