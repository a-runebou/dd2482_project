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
    MembershipRole,
)
from app.infra.models.scheduling import (
    Proposal,
    ProposalOrigin,
)
from app.infra.models.user import User
from app.main import app
from app.services.availability import (
    AggregateData,
    MatrixData,
    ParticipantData,
)
from app.services.groups import GroupView
from app.services.proposals import ProposalView

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

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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


def test_list_groups(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.get_group_view",
        lambda *args, **kwargs: view,
    )

    response = client.get(
        "/api/v1/groups/7fQ2mXk9Lp3R"
    )

    assert response.status_code == 200
    assert response.headers["etag"] == '"1"'

    app.dependency_overrides.clear()


def test_patch_group(monkeypatch) -> None:
    user = make_user()
    view = make_view(user)

    view.group.name = "Updated"
    view.group.version = 2

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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


def test_delete_group(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.delete_group",
        lambda *args, **kwargs: None,
    )

    response = client.delete(
        "/api/v1/groups/7fQ2mXk9Lp3R"
    )

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

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.join_group",
        lambda *args, **kwargs: view,
    )

    response = client.post(
        "/api/v1/groups/7fQ2mXk9Lp3R/join",
        json={
            "invite_token":
                "1234567890abcdef"
        },
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

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.list_members",
        lambda *args, **kwargs: [member],
    )

    response = client.get(
        "/api/v1/groups/7fQ2mXk9Lp3R/members"
    )

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1

    app.dependency_overrides.clear()


def test_remove_member(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
    app.dependency_overrides[get_db] = override_db

    monkeypatch.setattr(
        "app.api.groups.remove_member",
        lambda *args, **kwargs: None,
    )

    response = client.delete(
        f"/api/v1/groups/7fQ2mXk9Lp3R"
        f"/members/{uuid4()}"
    )

    assert response.status_code == 204

    app.dependency_overrides.clear()



def test_get_my_availability(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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

    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/availability/me"
    )

    assert response.status_code == 200
    assert len(response.json()["available"]) == 1

    app.dependency_overrides.clear()


def test_put_my_availability(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/availability/me",
        json={
            "available": [
                "2026-10-01T08:00:00Z"
            ],
            "preferred": [],
        },
    )

    assert response.status_code == 200
    assert response.headers["etag"] == '"2"'

    app.dependency_overrides.clear()


def test_get_availability_matrix(
    monkeypatch,
) -> None:
    user = make_user()

    app.dependency_overrides[get_current_user] = (
        lambda: user
    )
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

    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/availability"
    )

    assert response.status_code == 200
    assert response.json()["member_count"] == 1
    assert response.json()["responded_count"] == 1

    app.dependency_overrides.clear()


def test_get_suggestions(monkeypatch) -> None:
    user = make_user()

    app.dependency_overrides[
        get_current_user
    ] = lambda: user
    app.dependency_overrides[
        get_db
    ] = override_db

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

    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/suggestions"
    )

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1
    assert response.json()["data"][0][
        "score"
    ] == 4.0

    app.dependency_overrides.clear()


def test_suggestions_require_auth() -> None:
    response = client.get(
        "/api/v1/groups/"
        "7fQ2mXk9Lp3R/suggestions"
    )

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
        created_at=datetime.now(
            UTC
        ),
    )

    return ProposalView(
        proposal=proposal,
        yes=[],
        maybe=[],
        no=[],
        my_vote=None,
    )

