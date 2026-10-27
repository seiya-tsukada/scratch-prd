"""計測イベント: フロントからの受信（ホワイトリスト）と、API の処理中のサーバー側記録"""

from __future__ import annotations

from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config
from backend.app.main import app
from backend.app.models.ai import GeneratedPrd
from backend.app.services.gemini import get_gemini_client

from .conftest import login_guest
from .test_ai_router import FakeGemini
from .test_password_auth import PASSWORD, add_note, login, register


def events(db: psycopg.Connection[Any]) -> list[tuple[str, dict[str, Any]]]:
    rows = db.execute("select event_name, properties from idea_ws.events order by created_at, event_name").fetchall()
    return [(r[0], r[1]) for r in rows]


def names(db: psycopg.Connection[Any]) -> list[str]:
    return [name for name, _ in events(db)]


# ---------------------------------------------------------------- フロントからの受信


def test_client_event_is_recorded_with_session(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    response = guest_client.post(
        "/api/events", json={"name": "signup_prompt_shown", "properties": {"trigger": "quota"}}
    )
    assert response.status_code == 204
    row = db_admin.execute(
        "select properties, user_id is not null, session_id is not null from idea_ws.events "
        "where event_name = 'signup_prompt_shown'"
    ).fetchone()
    assert row == ({"trigger": "quota"}, True, True)


@pytest.mark.parametrize(
    "body",
    [
        {"name": "guest_created"},  # サーバー側でのみ記録するイベント
        {"name": "unknown_event"},
        {"name": "signup_prompt_shown", "properties": {"trigger": "nope"}},
        {"name": "signup_prompt_shown", "properties": {"trigger": "quota", "email": "a@example.com"}},
        {"name": "app_opened", "properties": {"extra": 1}},
    ],
)
def test_client_events_are_whitelisted(guest_client: TestClient, body: dict[str, Any]) -> None:
    assert guest_client.post("/api/events", json=body).status_code == 422


def test_client_events_are_rate_limited(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    limit = config.EVENTS_RATE_LIMIT_PER_SESSION[0]
    db_admin.execute("update idea_ws.rate_limit_buckets set count = 0")  # ゲスト作成分は別キー
    for _ in range(limit):
        assert guest_client.post("/api/events", json={"name": "app_opened"}).status_code == 204
    assert guest_client.post("/api/events", json={"name": "app_opened"}).status_code == 429


def test_client_events_require_session_and_origin(client: TestClient) -> None:
    assert client.post("/api/events", json={"name": "app_opened"}).status_code == 401
    login_guest(client)
    client.headers.pop("Origin")
    assert client.post("/api/events", json={"name": "app_opened"}).status_code == 403


# ---------------------------------------------------------------- サーバー側の記録


def test_server_side_funnel_events(
    guest_client: TestClient, db_admin: psycopg.Connection[Any], make_client: Any
) -> None:
    add_note(guest_client, "memo")
    app.dependency_overrides[get_gemini_client] = lambda: FakeGemini(GeneratedPrd(markdown="# ok"))
    guest_client.post(
        "/api/generate-prd",
        json={"projectName": "P", "mode": "strict", "detailLevel": "brief", "notes": [{"id": "n", "content": "x"}]},
    )
    register(guest_client)

    other = make_client()
    login_guest(other)
    login(other, guestData="merge")

    recorded = events(db_admin)
    assert [n for n, _ in recorded].count("guest_created") == 2
    assert ("note_created", {}) in recorded
    assert (
        "prd_generated",
        {"mode": "strict", "detailLevel": "brief", "noteCount": 1, "usedFallback": False},
    ) in recorded
    assert ("signup_completed", {"method": "password"}) in recorded
    assert ("account_merged", {}) in recorded


def test_rate_limited_event_on_quota(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    app.dependency_overrides[get_gemini_client] = lambda: FakeGemini(GeneratedPrd(markdown="# ok"))
    body = {"notes": [{"id": "n", "content": "x"}]}
    for _ in range(config.AI_DAILY_QUOTAS["guest"]["prd"] + 1):
        guest_client.post("/api/generate-prd", json=body)
    assert ("rate_limited", {"kind": "prd"}) in events(db_admin)


def test_event_failure_does_not_break_the_request(guest_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.app.services import events as events_service

    def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("db down")

    monkeypatch.setattr(events_service, "validate_properties", broken)
    body = guest_client.get("/api/workspace/bootstrap").json()
    section = body["data"]["sections"][0]["id"]
    response = guest_client.post(f"/api/projects/{body['currentProjectId']}/notes", json={"sectionId": section})
    assert response.status_code == 201


def test_login_without_merge_records_no_merge_event(
    guest_client: TestClient, db_admin: psycopg.Connection[Any], make_client: Any
) -> None:
    register(guest_client)
    login(make_client(), password=PASSWORD)
    assert "account_merged" not in names(db_admin)


@pytest.mark.parametrize(
    "body",
    [
        {"name": "open_question_answered"},
        {"name": "prd_regenerated_with_answers", "properties": {"answers": 2}},
        {"name": "contradiction_viewed", "properties": {"count": 1}},
    ],
)
def test_prd_loop_events_are_accepted(guest_client: TestClient, body: dict[str, Any]) -> None:
    assert guest_client.post("/api/events", json=body).status_code == 204
