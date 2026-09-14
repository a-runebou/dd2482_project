from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    Header,
    Query,
    Response,
    status,
)
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.errors import ProblemException
from app.api.schemas import (
    AvailabilityMatrix,
    AvailabilitySelection,
    ConfirmationRequest,
    GroupCreate,
    GroupPageResponse,
    GroupPatch,
    GroupResponse,
    GroupWithInviteResponse,
    JoinRequest,
    MemberPageResponse,
    MemberResponse,
    ParticipantAvailability,
    ProposalResponse,
    ProposalVotes,
    SlotAggregate,
    SuggestionPageResponse,
    SuggestionResponse,
    VoteInput,
)
from app.config import get_settings
from app.domain.slots import SlotValidationError
from app.infra.db import get_db
from app.infra.models.scheduling import (
    VoteValue,
)
from app.infra.models.user import User
from app.services.availability import (
    get_availability_matrix,
    get_my_availability,
    put_my_availability,
)
from app.services.confirmation import (
    AlreadyConfirmed,
    NotConfirmed,
    confirm_group,
    unconfirm_group,
)
from app.services.groups import (
    GroupLimitReached,
    GroupNotFound,
    GroupView,
    NotOwner,
    VersionConflict,
    create_group,
    delete_group,
    etag_for,
    get_group_view,
    list_group_views,
    update_group,
)
from app.services.memberships import (
    AlreadyMember,
    ForbiddenMemberAction,
    MemberLimitReached,
    join_group,
    list_members,
    remove_member,
)
from app.services.proposals import (
    GroupConfirmed as ProposalGroupConfirmed,
)
from app.services.proposals import (
    ProposalLimitReached,
    ProposalNotFound,
    ProposalView,
    delete_vote,
    put_vote,
)
from app.services.suggestions import (
    get_suggestions,
)

router = APIRouter(
    prefix="/groups",
    tags=["groups"],
)


def group_response(view: GroupView) -> GroupResponse:
    group = view.group

    return GroupResponse(
        slug=group.slug,
        name=group.name,
        description=group.description,
        owner_id=group.owner_id,
        timezone=group.timezone,
        date_start=group.date_start,
        date_end=group.date_end,
        window_start_minute=group.window_start_minute,
        window_end_minute=group.window_end_minute,
        slot_minutes=30,
        state=group.state.value,
        confirmed_proposal=None,
        member_count=view.member_count,
        my_role=view.my_role.value,
        feed_url=None,
        version=group.version,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def raise_group_error(exc: Exception) -> None:
    if isinstance(exc, GroupNotFound):
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc

    if isinstance(exc, NotOwner):
        raise ProblemException(
            status_code=403,
            code="not_owner",
            title="Owner access required",
        ) from exc

    if isinstance(exc, VersionConflict):
        raise ProblemException(
            status_code=412,
            code="version_conflict",
            title="Version conflict",
        ) from exc

    if isinstance(exc, GroupLimitReached):
        raise ProblemException(
            status_code=400,
            code="validation_failed",
            title="Group limit reached",
        ) from exc

    if isinstance(exc, SlotValidationError):
        status_code = 422 if exc.code == "range_too_long" else 400

        raise ProblemException(
            status_code=status_code,
            code=exc.code,
            title="Validation failed",
            detail=str(exc),
        ) from exc

    raise exc


@router.get(
    "",
    response_model=GroupPageResponse,
)
def get_groups(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupPageResponse:
    try:
        views, next_cursor = list_group_views(
            db,
            user_id=user.id,
            limit=limit,
            cursor=cursor,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    return GroupPageResponse(
        data=[group_response(view) for view in views],
        next_cursor=next_cursor,
    )


@router.post(
    "",
    response_model=GroupWithInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_group(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupWithInviteResponse:
    try:
        view, invite_token = create_group(
            db,
            user=user,
            name=body.name,
            description=body.description,
            timezone_name=body.timezone,
            date_start=body.date_start,
            date_end=body.date_end,
            window_start_minute=(body.window_start_minute),
            window_end_minute=body.window_end_minute,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    settings = get_settings()

    base = group_response(view)

    return GroupWithInviteResponse(
        **base.model_dump(),
        invite_url=(
            f"{settings.public_app_url.rstrip('/')}"
            f"/join/{view.group.slug}"
            f"?invite={invite_token}"
        ),
    )


@router.get(
    "/{slug}",
    response_model=GroupResponse,
)
def get_group(
    slug: str,
    response: Response,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse | Response:
    try:
        view = get_group_view(
            db,
            slug=slug,
            user_id=user.id,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    etag = etag_for(view.group.version)

    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
        )

    response.headers["ETag"] = etag

    return group_response(view)


@router.patch(
    "/{slug}",
    response_model=GroupResponse,
)
def patch_group(
    slug: str,
    body: GroupPatch,
    response: Response,
    if_match: str | None = Header(
        default=None,
        alias="If-Match",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse:
    try:
        view = update_group(
            db,
            slug=slug,
            user_id=user.id,
            changes=body.model_dump(exclude_unset=True),
            if_match=if_match,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    response.headers["ETag"] = etag_for(view.group.version)

    return group_response(view)


@router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_group(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_group(
            db,
            slug=slug,
            user_id=user.id,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{slug}/join",
    response_model=GroupResponse,
)
def post_join_group(
    slug: str,
    body: JoinRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse:
    try:
        view = join_group(
            db,
            slug=slug,
            user=user,
            invite_token=body.invite_token,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc
    except AlreadyMember as exc:
        raise ProblemException(
            status_code=409,
            code="already_member",
            title="Already a member",
        ) from exc
    except MemberLimitReached as exc:
        raise ProblemException(
            status_code=409,
            code="member_limit_reached",
            title="Member limit reached",
        ) from exc

    return group_response(view)


@router.get(
    "/{slug}/members",
    response_model=MemberPageResponse,
)
def get_members(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemberPageResponse:
    try:
        members = list_members(
            db,
            slug=slug,
            caller_id=user.id,
        )
    except Exception as exc:
        raise_group_error(exc)
        raise

    return MemberPageResponse(
        data=[
            MemberResponse(
                user_id=member.user.id,
                display_name=(member.user.display_name or "User"),
                role=member.membership.role.value,
                responded=member.responded,
                notify_email=(member.membership.notify_email),
                joined_at=member.membership.joined_at,
            )
            for member in members
        ],
        next_cursor=None,
    )


@router.delete(
    "/{slug}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_member(
    slug: str,
    user_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        remove_member(
            db,
            slug=slug,
            caller_id=user.id,
            target_user_id=user_id,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc
    except ForbiddenMemberAction as exc:
        raise ProblemException(
            status_code=403,
            code="forbidden",
            title="Forbidden",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{slug}/availability",
    response_model=AvailabilityMatrix,
)
def get_group_availability(
    slug: str,
    response: Response,
    if_none_match: str | None = Header(
        default=None,
        alias="If-None-Match",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilityMatrix | Response:
    try:
        matrix = get_availability_matrix(
            db,
            slug=slug,
            user_id=user.id,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc

    etag = etag_for(matrix.version)

    if if_none_match == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED,
        )

    response.headers["ETag"] = etag

    return AvailabilityMatrix(
        version=matrix.version,
        slots=matrix.slots,
        participants=[
            ParticipantAvailability(
                user_id=participant.user_id,
                display_name=(participant.display_name),
                responded=participant.responded,
                available=participant.available,
                preferred=participant.preferred,
            )
            for participant in matrix.participants
        ],
        aggregate=[
            SlotAggregate(
                slot_index=item.slot_index,
                available_count=(item.available_count),
                preferred_count=(item.preferred_count),
            )
            for item in matrix.aggregate
        ],
        responded_count=matrix.responded_count,
        member_count=matrix.member_count,
    )


@router.get(
    "/{slug}/availability/me",
    response_model=AvailabilitySelection,
)
def get_own_availability(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilitySelection:
    try:
        available, preferred = get_my_availability(
            db,
            slug=slug,
            user_id=user.id,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc

    return AvailabilitySelection(
        available=available,
        preferred=preferred,
    )


@router.put(
    "/{slug}/availability/me",
    response_model=AvailabilitySelection,
)
def put_own_availability(
    slug: str,
    body: AvailabilitySelection,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilitySelection:
    try:
        available, preferred, version = put_my_availability(
            db,
            slug=slug,
            user_id=user.id,
            available=body.available,
            preferred=body.preferred,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc
    except ProposalLimitReached as exc:
        raise ProblemException(
            status_code=400,
            code="validation_failed",
            title="Proposal limit reached",
        ) from exc
    except SlotValidationError as exc:
        raise ProblemException(
            status_code=422,
            code="slot_not_in_window",
            title="Slot not in window",
            detail=str(exc),
        ) from exc

    response.headers["ETag"] = etag_for(version)

    return AvailabilitySelection(
        available=available,
        preferred=preferred,
    )


@router.get(
    "/{slug}/suggestions",
    response_model=SuggestionPageResponse,
)
def get_group_suggestions(
    slug: str,
    duration_minutes: int = Query(
        default=60,
        ge=30,
        le=480,
        multiple_of=30,
    ),
    limit: int = Query(
        default=5,
        ge=1,
        le=20,
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestionPageResponse:
    try:
        suggestions = get_suggestions(
            db,
            slug=slug,
            user_id=user.id,
            duration_minutes=duration_minutes,
            limit=limit,
        )
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc

    return SuggestionPageResponse(
        data=[
            SuggestionResponse(
                start_at=item.start_at,
                end_at=item.end_at,
                score=item.score,
                available_user_ids=(item.available_user_ids),
                preferred_user_ids=(item.preferred_user_ids),
                missing_user_ids=(item.missing_user_ids),
            )
            for item in suggestions
        ],
        next_cursor=None,
    )


def proposal_response(
    view: ProposalView,
) -> ProposalResponse:
    proposal = view.proposal

    return ProposalResponse(
        id=proposal.id,
        start_at=proposal.start_at,
        end_at=proposal.end_at,
        origin=proposal.origin.value,
        created_by=proposal.created_by,
        votes=ProposalVotes(
            yes=view.yes,
            maybe=view.maybe,
            no=view.no,
        ),
        my_vote=(view.my_vote.value if view.my_vote is not None else None),
        created_at=proposal.created_at,
    )


@router.put(
    "/{slug}/proposals/{proposal_id}/vote/me",
    response_model=ProposalResponse,
)
def put_my_vote(
    slug: str,
    proposal_id: UUID,
    body: VoteInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProposalResponse:
    try:
        proposal = put_vote(
            db,
            slug=slug,
            user_id=user.id,
            proposal_id=proposal_id,
            value=VoteValue(body.value),
        )
    except (
        GroupNotFound,
        ProposalNotFound,
    ) as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Not found",
        ) from exc
    except ProposalGroupConfirmed as exc:
        raise ProblemException(
            status_code=409,
            code="group_confirmed",
            title="Group confirmed",
        ) from exc

    return proposal_response(proposal)


@router.delete(
    "/{slug}/proposals/{proposal_id}/vote/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_my_vote(
    slug: str,
    proposal_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        delete_vote(
            db,
            slug=slug,
            user_id=user.id,
            proposal_id=proposal_id,
        )
    except (
        GroupNotFound,
        ProposalNotFound,
    ) as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Not found",
        ) from exc
    except ProposalGroupConfirmed as exc:
        raise ProblemException(
            status_code=409,
            code="group_confirmed",
            title="Group confirmed",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{slug}/confirmation",
    response_model=GroupResponse,
)
def post_confirmation(
    slug: str,
    body: ConfirmationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse:
    try:
        view = confirm_group(
            db,
            slug=slug,
            user_id=user.id,
            proposal_id=body.proposal_id,
            send_reminders=(body.send_reminders),
        )
    except NotOwner as exc:
        raise ProblemException(
            status_code=403,
            code="not_owner",
            title="Owner access required",
        ) from exc
    except (
        GroupNotFound,
        ProposalNotFound,
    ) as exc:
        raise ProblemException(
            status_code=404,
            code="not_found",
            title="Not found",
        ) from exc
    except AlreadyConfirmed as exc:
        raise ProblemException(
            status_code=409,
            code="group_confirmed",
            title="Group already confirmed",
        ) from exc

    return group_response(view)


@router.delete(
    "/{slug}/confirmation",
    response_model=GroupResponse,
)
def delete_confirmation(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupResponse:
    try:
        view = unconfirm_group(
            db,
            slug=slug,
            user_id=user.id,
        )
    except NotOwner as exc:
        raise ProblemException(
            status_code=403,
            code="not_owner",
            title="Owner access required",
        ) from exc
    except GroupNotFound as exc:
        raise ProblemException(
            status_code=404,
            code="group_not_found",
            title="Group not found",
        ) from exc
    except NotConfirmed as exc:
        raise ProblemException(
            status_code=409,
            code="validation_failed",
            title="Group is not confirmed",
        ) from exc

    return group_response(view)
