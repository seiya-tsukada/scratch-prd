"""Vercel 上の動作: セキュリティヘッダー、プレビュー URL の Origin、画面（dist/）の配信"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from backend.app import config


def test_security_headers(client: TestClient) -> None:
    response = client.get("/api/health")
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "https://challenges.cloudflare.com" in csp  # Turnstile
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "strict-transport-security" not in response.headers  # ローカル（http）では付けない


def test_hsts_when_secure(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "true")
    config.get_settings.cache_clear()
    assert client.get("/api/health").headers["strict-transport-security"].startswith("max-age=")


def test_vercel_deployment_urls_are_allowed_origins(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_URL", "idea-ws-abc123.vercel.app")
    monkeypatch.setenv("VERCEL_BRANCH_URL", "idea-ws-git-feature.vercel.app")
    config.get_settings.cache_clear()
    origins = config.get_settings().allowed_origin_list
    assert "https://idea-ws-abc123.vercel.app" in origins
    assert "https://idea-ws-git-feature.vercel.app" in origins
    assert "http://localhost:3000" in origins

    response = client.post("/api/auth/logout", headers={"Origin": "https://idea-ws-abc123.vercel.app"})
    assert response.status_code == 204
    response = client.post("/api/auth/logout", headers={"Origin": "https://other.vercel.app"})
    assert response.status_code == 403


def test_frontend_serving_keeps_api_routes_first(tmp_path: Path) -> None:
    """main.py と同じく、API のルートを登録したあとに app.frontend で dist/ を配信する"""
    (tmp_path / "index.html").write_text("<html>spa</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")

    app = FastAPI()
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(router, prefix="/api")
    app.frontend("/", directory=tmp_path)
    client = TestClient(app)

    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/assets/app.js").text == "console.log(1)"
    navigation = {"accept": "text/html", "sec-fetch-mode": "navigate"}
    assert client.get("/projects/123", headers=navigation).text == "<html>spa</html>"
    # 存在しない API は画面ではなく 404 にする
    api_miss = client.get("/api/does-not-exist", headers={"accept": "application/json"})
    assert api_miss.status_code == 404
    assert "spa" not in api_miss.text
