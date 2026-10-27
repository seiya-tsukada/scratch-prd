"""初回オンボーディングの記録"""

from __future__ import annotations

from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from .test_password_auth import login, register


def onboarding_events(db: psycopg.Connection[Any]) -> list[str]:
    rows = db.execute("select event_name from idea_ws.events where event_name like 'onboarding_%' order by created_at")
    return [r[0] for r in rows.fetchall()]


@pytest.mark.parametrize("result", ["completed", "skipped"])
def test_finishing_onboarding_is_recorded_once(
    guest_client: TestClient, db_admin: psycopg.Connection[Any], result: str
) -> None:
    assert guest_client.get("/api/auth/me").json()["user"]["onboardingDone"] is False

    assert guest_client.post("/api/account/onboarding", json={"result": result}).status_code == 204
    assert guest_client.post("/api/account/onboarding", json={"result": "completed"}).status_code == 204

    assert guest_client.get("/api/auth/me").json()["user"]["onboardingDone"] is True
    assert db_admin.execute("select onboarding_result from idea_ws.users").fetchone() == (result,)
    assert onboarding_events(db_admin) == [f"onboarding_{result}"]


def test_onboarding_result_is_validated(guest_client: TestClient) -> None:
    assert guest_client.post("/api/account/onboarding", json={"result": "maybe"}).status_code == 422


def test_onboarding_requires_session_and_origin(client: TestClient) -> None:
    assert client.post("/api/account/onboarding", json={"result": "skipped"}).status_code == 401
    client.headers.pop("Origin")
    assert client.post("/api/account/onboarding", json={"result": "skipped"}).status_code == 403


def test_onboarding_state_survives_registration(guest_client: TestClient) -> None:
    guest_client.post("/api/account/onboarding", json={"result": "completed"})
    response = register(guest_client)
    assert response.json()["user"]["onboardingDone"] is True


def test_login_uses_the_accounts_onboarding_state(guest_client: TestClient, make_client: Any) -> None:
    guest_client.post("/api/account/onboarding", json={"result": "completed"})
    register(guest_client)

    other = make_client()  # 新しいブラウザ（案内はまだ見ていない）
    response = login(other)
    assert response.json()["user"]["onboardingDone"] is True
    assert other.get("/api/auth/me").json()["user"]["onboardingDone"] is True


def test_client_onboarding_events_are_accepted(guest_client: TestClient) -> None:
    assert guest_client.post("/api/events", json={"name": "onboarding_started"}).status_code == 204
    ok = guest_client.post("/api/events", json={"name": "quick_prd_used", "properties": {"structured": True}})
    assert ok.status_code == 204
    # 完了・スキップはサーバー側でのみ記録する
    assert guest_client.post("/api/events", json={"name": "onboarding_completed"}).status_code == 422
