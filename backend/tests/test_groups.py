from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.domain.suggestions import (
    SuggestionResult,
)
from app.infra.db import get_db
from app.infra.models.group import (
    Group,
    GroupState,
    Membership,
    MembershipRole,
)
from app.infra.models.scheduling import (
    Proposal,
    ProposalOrigin,
    Vote,
    VoteValue,
)
from app.infra.models.user import User
from app.main import app
from app.services.availability import (
    AggregateData,
    GroupConfirmed,
    MatrixData,
    ParticipantData,
)
from app.services.confirmation import NotConfirmed
from app.services.groups import (
    GroupLimitReached,
    GroupNotFound,
    GroupView,
    bump_group_version,
)
from app.services.memberships import remove_member
from app.services.proposals import ProposalNotFound, ProposalView

client = TestClient(app)


def make_user() -> User:
    return User(
        id=uuid4(),
        email="alex@example.com",
        display_name="Alex",
        timezone="Europe/Stockholm",
        notify_email_default=True,
        created_at=datetime.now(UTC),
    )


def make_view(user: User) -> GroupView:
    now = datetime.now(UTC)

    group = Group(
        id=uuid4(),
        slug="7fQ2mXk9Lp3R",
        name="Project group",
        description=None,
        owner_id=user.id,
        timezone="Europe/Stockholm",
        date_start=date(2026, 10, 1),
        date_end=date(2026, 10, 7),
        window_start_minute=480,
        window_end_minute=1020,
        slot_minutes=30,
        state=GroupState.OPEN,
        invite_token_hash="invite",
        feed_token_hash="feed",
        version=1,
        created_at=now,
        updated_at=now,
    )

    return GroupView(
        group=group,
        member_count=1,
        my_role=MembershipRole.OWNER,
    )


def override_db():
    yield object()


def test_create_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.create_group",
        lambda *args, **kwargs: (
            view,
            "test-invite-token",
        ),
    )

    response = client.post(
        "/api/v1/groups",
        json={
            "name": "Project group",
            "date_start": "2026-10-01",
            "date_end": "2026-10-07",
            "window_start_minute": 480,
            "window_end_minute": 1020,
        },
    )

    assert response.status_code == 201
    assert response.json()["slug"] == "7fQ2mXk9Lp3R"
    assert "invite_url" in response.json()

    app.dependency_overrides.clear()


def test_create_group_limit_returns_conflict(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise GroupLimitReached

    monkeypatch.setattr("app.api.groups.create_group", fail)

    response = client.post(
        "/api/v1/groups",
        json={
            "name": "Project group",
            "date_start": "2026-10-01",
            "date_end": "2026-10-07",
            "window_start_minute": 480,
            "window_end_minute": 1020,
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "group_limit_reached"

    app.dependency_overrides.clear()


def test_list_groups(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.list_group_views",
        lambda *args, **kwargs: ([view], None),
    )

    response = client.get("/api/v1/groups")

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["next_cursor"] is None

    app.dependency_overrides.clear()


def test_get_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.get_group_view",
        lambda *args, **kwargs: view,
    )

    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R")

    assert response.status_code == 200
    assert response.headers["etag"] == '"1"'

    app.dependency_overrides.clear()


def test_bump_group_version_increments_once() -> None:
    user = make_user()
    view = make_view(user)
    updated_at = datetime(2026, 9, 16, 12, tzinfo=UTC)

    bump_group_version(view.group, now=updated_at)

    assert view.group.version == 2
    assert view.group.updated_at == updated_at


def test_group_etag_changes_after_mutation(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.get_group_view",
        lambda *args, **kwargs: view,
    )

    first_response = client.get("/api/v1/groups/7fQ2mXk9Lp3R")
    etag_before = first_response.headers["etag"]

    def mutate_group(*args, **kwargs):
        del args, kwargs
        bump_group_version(view.group)
        return view

    monkeypatch.setattr(
        "app.api.groups.update_group",
        mutate_group,
    )

    mutation_response = client.patch(
        "/api/v1/groups/7fQ2mXk9Lp3R",
        json={"name": "Updated"},
    )

    second_response = client.get(
        "/api/v1/groups/7fQ2mXk9Lp3R",
        headers={"If-None-Match": etag_before},
    )

    assert mutation_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.headers["etag"] == '"2"'
    assert second_response.json()["version"] == 2

    app.dependency_overrides.clear()


def test_patch_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    view.group.name = "Updated"
    view.group.version = 2

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.update_group",
        lambda *args, **kwargs: view,
    )

    response = client.patch(
        "/api/v1/groups/7fQ2mXk9Lp3R",
        json={"name": "Updated"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated"
    assert response.headers["etag"] == '"2"'

    app.dependency_overrides.clear()


def test_patch_group_returns_rotated_invite_url(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)
    view = GroupView(
        group=view.group,
        member_count=view.member_count,
        my_role=view.my_role,
        rotated_invite_token="new-invite-token",
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.update_group",
        lambda *args, **kwargs: view,
    )

    response = client.patch(
        "/api/v1/groups/7fQ2mXk9Lp3R",
        json={"rotate_invite_token": True},
    )

    assert response.status_code == 200
    assert response.json()["invite_url"].endswith(
        "/join/7fQ2mXk9Lp3R?invite=new-invite-token"
    )

    app.dependency_overrides.clear()


def test_delete_group(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.delete_group",
        lambda *args, **kwargs: None,
    )

    response = client.delete("/api/v1/groups/7fQ2mXk9Lp3R")

    assert response.status_code == 204

    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/v1/groups", None),
        (
            "POST",
            "/api/v1/groups",
            {
                "name": "Group",
                "date_start": "2026-10-01",
                "date_end": "2026-10-02",
                "window_start_minute": 480,
                "window_end_minute": 1020,
            },
        ),
        (
            "GET",
            "/api/v1/groups/7fQ2mXk9Lp3R",
            None,
        ),
        (
            "PATCH",
            "/api/v1/groups/7fQ2mXk9Lp3R",
            {"name": "Updated"},
        ),
        (
            "DELETE",
            "/api/v1/groups/7fQ2mXk9Lp3R",
            None,
        ),
    ],
)
def test_group_endpoints_require_auth(
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    response = client.request(
        method,
        path,
        json=body,
    )

    assert response.status_code == 401


def test_join_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.join_group",
        lambda *args, **kwargs: view,
    )

    response = client.post(
        "/api/v1/groups/7fQ2mXk9Lp3R/join",
        json={"invite_token": "1234567890abcdef"},
    )

    assert response.status_code == 200

    app.dependency_overrides.clear()


def test_list_members(monkeypatch) -> None:
    user = make_user()
    now = datetime.now(UTC)

    from app.infra.models.group import Membership
    from app.services.memberships import MemberView

    membership = Membership(
        group_id=uuid4(),
        user_id=user.id,
        role=MembershipRole.OWNER,
        notify_email=True,
        joined_at=now,
    )

    member = MemberView(
        membership=membership,
        user=user,
        responded=False,
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.list_members",
        lambda *args, **kwargs: [member],
    )

    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R/members")

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    app.dependency_overrides.clear()


def test_remove_member(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.remove_member",
        lambda *args, **kwargs: None,
    )

    response = client.delete(f"/api/v1/groups/7fQ2mXk9Lp3R/members/{uuid4()}")

    assert response.status_code == 204

    app.dependency_overrides.clear()


def test_remove_member_only_deletes_votes_in_target_group(monkeypatch) -> None:
    caller = make_user()
    target = make_user()
    group = make_view(caller).group
    other_group = make_view(caller).group
    group_proposal = Proposal(
        id=uuid4(),
        group_id=group.id,
        start_at=datetime(2026, 10, 1, 8, 0, tzinfo=UTC),
        end_at=datetime(2026, 10, 1, 8, 30, tzinfo=UTC),
        origin=ProposalOrigin.MANUAL,
        created_by=caller.id,
        created_at=datetime.now(UTC),
    )
    other_group_proposal = Proposal(
        id=uuid4(),
        group_id=other_group.id,
        start_at=datetime(2026, 10, 2, 8, 0, tzinfo=UTC),
        end_at=datetime(2026, 10, 2, 8, 30, tzinfo=UTC),
        origin=ProposalOrigin.MANUAL,
        created_by=caller.id,
        created_at=datetime.now(UTC),
    )
    votes = [
        Vote(
            proposal_id=group_proposal.id,
            user_id=target.id,
            value=VoteValue.YES,
        ),
        Vote(
            proposal_id=other_group_proposal.id,
            user_id=target.id,
            value=VoteValue.NO,
        ),
    ]
    proposal_groups = {
        group_proposal.id: group.id,
        other_group_proposal.id: other_group.id,
    }
    memberships = [
        Membership(
            group_id=group.id,
            user_id=target.id,
            role=MembershipRole.MEMBER,
            notify_email=True,
            joined_at=datetime.now(UTC),
        ),
        Membership(
            group_id=other_group.id,
            user_id=target.id,
            role=MembershipRole.MEMBER,
            notify_email=True,
            joined_at=datetime.now(UTC),
        ),
    ]

    class FakeSession:
        def __init__(self) -> None:
            self.deleted_votes: list[Vote] = []
            self.deleted_objects: list[object] = []
            self.committed = False

        def scalar(self, statement):
            return Membership(
                group_id=group.id,
                user_id=target.id,
                role=MembershipRole.MEMBER,
                notify_email=True,
                joined_at=datetime.now(UTC),
            )

        def execute(self, statement):
            compiled = statement.compile()
            sql = str(compiled)
            if "DELETE FROM votes" in sql:
                assert "proposals.group_id" in sql
                target_group_id = next(
                    value
                    for value in compiled.params.values()
                    if value in proposal_groups.values()
                )
                self.deleted_votes = [
                    vote
                    for vote in votes
                    if proposal_groups[vote.proposal_id] == target_group_id
                ]

        def delete(self, value) -> None:
            self.deleted_objects.append(value)

        def commit(self) -> None:
            self.committed = True

    session = FakeSession()
    view = GroupView(
        group=group,
        member_count=2,
        my_role=MembershipRole.OWNER,
    )
    monkeypatch.setattr(
        "app.services.memberships.get_group_view",
        lambda *args, **kwargs: view,
    )

    remove_member(
        session,
        slug=group.slug,
        caller_id=caller.id,
        target_user_id=target.id,
    )

    assert {membership.group_id for membership in memberships} == {
        group.id,
        other_group.id,
    }
    assert group_proposal.id in {vote.proposal_id for vote in session.deleted_votes}
    assert other_group_proposal.id not in {
        vote.proposal_id for vote in session.deleted_votes
    }
    assert session.committed


def test_get_my_availability(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    slot = datetime(
        2026,
        10,
        1,
        8,
        0,
        tzinfo=UTC,
    )

    monkeypatch.setattr(
        "app.api.groups.get_my_availability",
        lambda *args, **kwargs: ([slot], []),
    )

    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R/availability/me")

    assert response.status_code == 200
    assert len(response.json()["available"]) == 1

    app.dependency_overrides.clear()


def test_put_my_availability(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    slot = datetime(
        2026,
        10,
        1,
        8,
        0,
        tzinfo=UTC,
    )

    monkeypatch.setattr(
        "app.api.groups.put_my_availability",
        lambda *args, **kwargs: (
            [slot],
            [],
            2,
        ),
    )

    response = client.put(
        "/api/v1/groups/7fQ2mXk9Lp3R/availability/me",
        json={
            "available": ["2026-10-01T08:00:00Z"],
            "preferred": [],
        },
    )

    assert response.status_code == 200
    assert response.headers["etag"] == '"2"'

    app.dependency_overrides.clear()


def test_put_my_availability_on_confirmed_group_returns_conflict(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise GroupConfirmed

    monkeypatch.setattr("app.api.groups.put_my_availability", fail)

    response = client.put(
        "/api/v1/groups/7fQ2mXk9Lp3R/availability/me",
        json={"available": [], "preferred": []},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "group_confirmed"

    app.dependency_overrides.clear()


def test_get_availability_matrix(
    monkeypatch,
) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    slot = datetime(
        2026,
        10,
        1,
        8,
        0,
        tzinfo=UTC,
    )

    matrix = MatrixData(
        version=1,
        slots=[slot],
        participants=[
            ParticipantData(
                user_id=user.id,
                display_name="Alex",
                responded=True,
                available=[0],
                preferred=[],
            )
        ],
        aggregate=[
            AggregateData(
                slot_index=0,
                available_count=1,
                preferred_count=0,
            )
        ],
        responded_count=1,
        member_count=1,
    )

    monkeypatch.setattr(
        "app.api.groups.get_availability_matrix",
        lambda *args, **kwargs: matrix,
    )

    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R/availability")

    assert response.status_code == 200
    assert response.json()["member_count"] == 1
    assert response.json()["responded_count"] == 1

    app.dependency_overrides.clear()


def test_get_suggestions(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    start = datetime(
        2026,
        10,
        1,
        8,
        0,
        tzinfo=UTC,
    )

    end = datetime(
        2026,
        10,
        1,
        9,
        0,
        tzinfo=UTC,
    )

    result = SuggestionResult(
        start_at=start,
        end_at=end,
        score=4.0,
        available_user_ids=[user.id],
        preferred_user_ids=[],
        missing_user_ids=[],
    )

    monkeypatch.setattr(
        "app.api.groups.get_suggestions",
        lambda *args, **kwargs: [result],
    )

    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R/suggestions")

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["data"][0]["score"] == 4.0

    app.dependency_overrides.clear()


def test_suggestions_require_auth() -> None:
    response = client.get("/api/v1/groups/7fQ2mXk9Lp3R/suggestions")

    assert response.status_code == 401


def make_proposal_view(
    user: User,
) -> ProposalView:
    proposal = Proposal(
        id=uuid4(),
        group_id=uuid4(),
        start_at=datetime(
            2026,
            10,
            1,
            8,
            0,
            tzinfo=UTC,
        ),
        end_at=datetime(
            2026,
            10,
            1,
            9,
            0,
            tzinfo=UTC,
        ),
        origin=ProposalOrigin.MANUAL,
        created_by=user.id,
        created_at=datetime.now(UTC),
    )

    return ProposalView(
        proposal=proposal,
        yes=[],
        maybe=[],
        no=[],
        my_vote=None,
    )


def test_put_vote(monkeypatch) -> None:
    user = make_user()
    proposal = make_proposal_view(user)

    proposal = ProposalView(
        proposal=proposal.proposal,
        yes=[user.id],
        maybe=[],
        no=[],
        my_vote=VoteValue.YES,
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.put_vote",
        lambda *args, **kwargs: proposal,
    )

    response = client.put(
        f"/api/v1/groups/7fQ2mXk9Lp3R/proposals/{proposal.proposal.id}/vote/me",
        json={"value": "yes"},
    )

    assert response.status_code == 200
    assert response.json()["my_vote"] == "yes"
    assert user.id.hex in (response.text.replace("-", ""))

    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("raised", "code"),
    [
        (GroupNotFound, "group_not_found"),
        (ProposalNotFound, "not_found"),
    ],
)
def test_put_vote_distinguishes_group_and_proposal_not_found(
    monkeypatch,
    raised: type[Exception],
    code: str,
) -> None:
    user = make_user()
    proposal_id = uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise raised

    monkeypatch.setattr("app.api.groups.put_vote", fail)

    response = client.put(
        f"/api/v1/groups/7fQ2mXk9Lp3R/proposals/{proposal_id}/vote/me",
        json={"value": "yes"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == code

    app.dependency_overrides.clear()


def test_delete_vote(monkeypatch) -> None:
    user = make_user()
    proposal_id = uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.delete_vote",
        lambda *args, **kwargs: None,
    )

    response = client.delete(
        f"/api/v1/groups/7fQ2mXk9Lp3R/proposals/{proposal_id}/vote/me"
    )

    assert response.status_code == 204

    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("raised", "code"),
    [
        (GroupNotFound, "group_not_found"),
        (ProposalNotFound, "not_found"),
    ],
)
def test_delete_vote_distinguishes_group_and_proposal_not_found(
    monkeypatch,
    raised: type[Exception],
    code: str,
) -> None:
    user = make_user()
    proposal_id = uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise raised

    monkeypatch.setattr("app.api.groups.delete_vote", fail)

    response = client.delete(
        f"/api/v1/groups/7fQ2mXk9Lp3R/proposals/{proposal_id}/vote/me"
    )

    assert response.status_code == 404
    assert response.json()["code"] == code

    app.dependency_overrides.clear()


def test_confirm_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    view.group.state = GroupState.CONFIRMED
    view.group.confirmed_proposal_id = uuid4()
    view.group.version = 2

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.confirm_group",
        lambda *args, **kwargs: view,
    )

    response = client.post(
        "/api/v1/groups/7fQ2mXk9Lp3R/confirmation",
        json={
            "proposal_id": str(view.group.confirmed_proposal_id),
            "send_reminders": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["state"] == ("confirmed")
    assert response.json()["version"] == 2

    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    ("raised", "code"),
    [
        (GroupNotFound, "group_not_found"),
        (ProposalNotFound, "not_found"),
    ],
)
def test_confirm_group_distinguishes_group_and_proposal_not_found(
    monkeypatch,
    raised: type[Exception],
    code: str,
) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise raised

    monkeypatch.setattr("app.api.groups.confirm_group", fail)

    response = client.post(
        "/api/v1/groups/7fQ2mXk9Lp3R/confirmation",
        json={"proposal_id": str(uuid4()), "send_reminders": False},
    )

    assert response.status_code == 404
    assert response.json()["code"] == code

    app.dependency_overrides.clear()


def test_unconfirm_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    view.group.state = GroupState.OPEN
    view.group.confirmed_proposal_id = None
    view.group.version = 3

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.unconfirm_group",
        lambda *args, **kwargs: view,
    )

    response = client.delete("/api/v1/groups/7fQ2mXk9Lp3R/confirmation")

    assert response.status_code == 200
    assert response.json()["state"] == "open"
    assert response.json()["version"] == 3

    app.dependency_overrides.clear()


def test_unconfirm_open_group_returns_conflict(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = override_db

    def fail(*args, **kwargs):
        raise NotConfirmed

    monkeypatch.setattr("app.api.groups.unconfirm_group", fail)

    response = client.delete("/api/v1/groups/7fQ2mXk9Lp3R/confirmation")

    assert response.status_code == 409
    assert response.json()["code"] == "group_not_confirmed"

    app.dependency_overrides.clear()
