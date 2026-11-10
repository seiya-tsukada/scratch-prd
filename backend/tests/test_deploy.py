"""Vercel 上の動作: セキュリティヘッダー、プレビュー URL の Origin、vercel.json と api/index.py"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import config, main

REPO_ROOT = Path(__file__).resolve().parents[2]


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


def test_vercel_static_headers_match_api_headers() -> None:
    """画面（dist/）は Vercel の CDN が配信するため、vercel.json の headers にも同じ CSP を書いている"""
    vercel = json.loads((REPO_ROOT / "vercel.json").read_text(encoding="utf-8"))
    headers = {h["key"]: h["value"] for rule in vercel["headers"] for h in rule["headers"]}
    assert headers["Content-Security-Policy"] == main.CONTENT_SECURITY_POLICY
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["X-Content-Type-Options"] == "nosniff"


def test_vercel_entrypoint_exposes_app() -> None:
    """api/index.py（Vercel Function）は backend の FastAPI をそのまま公開する"""
    from api.index import app

    assert app is main.app


PRODUCTION_ENV = {
    "VERCEL_ENV": "production",
    "DATABASE_URL": "postgresql://postgres.abcdef:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    "SESSION_TOKEN_PEPPER": "p" * config.MIN_PRODUCTION_SECRET_CHARS,
    "TURNSTILE_SECRET_KEY": "0x4AAAAAAAproductionsecret",
    "COOKIE_SECURE": "true",
    "TRUST_PROXY_HEADERS": "true",
    "CRON_SECRET": "c" * 16,
}


def test_production_settings_are_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in PRODUCTION_ENV.items():
        monkeypatch.setenv(name, value)
    settings = config.Settings()
    assert settings.vercel_env == "production"


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("DATABASE_URL", ""),
        ("DATABASE_URL", "postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres"),
        ("DATABASE_URL", "postgresql://idea_ws_app:idea_ws_app@db:5432/postgres"),
        ("SESSION_TOKEN_PEPPER", "local-dev-pepper-change-me"),
        ("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA"),
        ("TURNSTILE_SECRET_KEY", ""),
        ("COOKIE_SECURE", "false"),
        ("TRUST_PROXY_HEADERS", "false"),
        ("CRON_SECRET", ""),
    ],
)
def test_local_settings_are_rejected_in_production(monkeypatch: pytest.MonkeyPatch, name: str, value: str) -> None:
    for key, default in PRODUCTION_ENV.items():
        monkeypatch.setenv(key, default)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match="本番環境の設定に問題があります"):
        config.Settings()


def test_local_settings_are_allowed_outside_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    config.Settings()
