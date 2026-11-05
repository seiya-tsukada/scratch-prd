"""MOCK_BACKEND=true のモック API（DB なし）"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.mock import router as mock_router
from backend.tests.conftest import TEST_ORIGIN


@pytest.fixture
def mock_client() -> TestClient:
    app = FastAPI()
    app.include_router(mock_router.router, prefix="/api")
    return TestClient(app, headers={"Origin": TEST_ORIGIN})


def test_static_session_and_workspace(mock_client: TestClient) -> None:
    me = mock_client.get("/api/auth/me").json()["user"]
    assert me["isGuest"] is True
    assert me["onboardingDone"] is True
    assert mock_client.post("/api/auth/guest", json={"turnstileToken": "x"}).json()["user"] == me

    bootstrap = mock_client.get("/api/workspace/bootstrap").json()
    project_id = bootstrap["currentProjectId"]
    assert [p["id"] for p in bootstrap["projects"]] == [project_id]
    assert bootstrap["data"]["notes"]
    assert mock_client.get(f"/api/projects/{project_id}/data").json() == bootstrap["data"]
    assert mock_client.get("/api/projects").json() == bootstrap["projects"]


def test_unknown_project_is_404(mock_client: TestClient) -> None:
    other = "00000000-0000-0000-0000-000000000000"
    assert mock_client.get(f"/api/projects/{other}/data").status_code == 404
    assert mock_client.get(f"/api/workspace/bootstrap?project_id={other}").status_code == 404


def test_writes_are_rejected(mock_client: TestClient) -> None:
    for method, path in [
        ("POST", "/api/projects"),
        ("PATCH", "/api/notes/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/account"),
        ("POST", "/api/auth/register"),
    ]:
        response = mock_client.request(method, path, json={})
        assert response.status_code == 503, path
        assert response.json()["detail"]["code"] == "mock_mode"
    assert mock_client.post("/api/events", json={}).status_code == 204
    assert mock_client.post("/api/auth/logout").status_code == 204


def test_origin_is_still_checked(mock_client: TestClient) -> None:
    response = mock_client.post("/api/projects", json={}, headers={"Origin": "https://evil.example.com"})
    assert response.status_code == 403


def test_ai_uses_builtin_generator(mock_client: TestClient) -> None:
    structured = mock_client.post("/api/structure-rough-note", json={"title": "t", "content": "- a\n- b"}).json()
    assert structured["usedFallback"] is True
    assert structured["fallbackReason"] == "no_api_key"

    notes = [{"id": "n1", "title": "メモ", "content": "本文"}]
    prd = mock_client.post("/api/generate-prd", json={"projectName": "p", "notes": notes})
    assert prd.status_code == 200, prd.text
    assert prd.json()["usedFallback"] is True


def test_production_validation_is_skipped_in_mock_mode() -> None:
    with pytest.raises(ValueError):
        Settings(session_token_pepper="short", vercel_env="production")  # type: ignore[arg-type]
    settings = Settings(session_token_pepper="short", vercel_env="production", mock_backend=True)  # type: ignore[arg-type]
    assert settings.mock_backend is True
