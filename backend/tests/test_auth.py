"""ゲスト発行・セッション検証・失効・Origin 検証"""

from __future__ import annotations

from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config, security

from .conftest import FakeTurnstile, login_guest

COOKIE = config.SESSION_COOKIE_NAME


def session_rows(db: psycopg.Connection[Any]) -> list[tuple[Any, ...]]:
    return db.execute(
        "select token_hash, revoked_at, expires_at - now() > interval '179 days' from idea_ws.sessions"
    ).fetchall()


# ---------------------------------------------------------------- ゲスト発行


def test_create_guest_sets_secure_cookie_and_stores_only_hash(
    client: TestClient, db_admin: psycopg.Connection[Any], turnstile: FakeTurnstile
) -> None:
    response = client.post("/api/auth/guest", json={"turnstileToken": "tok"})

    assert response.status_code == 200
    user = response.json()["user"]
    assert user["isGuest"] is True
    assert turnstile.calls == [("tok", "testclient")]

    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{COOKIE}=")
    for attribute in ["HttpOnly", "Path=/", "SameSite=lax", f"Max-Age={180 * 24 * 3600}"]:
        assert attribute in set_cookie
    assert "Secure" not in set_cookie  # ローカル設定（COOKIE_SECURE=false）

    token = client.cookies[COOKIE]
    [(token_hash, revoked_at, long_lived)] = session_rows(db_admin)
    assert bytes(token_hash) == security.hash_token(token)
    assert token.encode() not in bytes(token_hash)
    assert revoked_at is None and long_lived

    row = db_admin.execute("select is_guest, email from idea_ws.users where id = %s", (user["id"],)).fetchone()
    assert row == (True, None)


def test_secure_cookie_uses_host_prefix(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "true")
    config.get_settings.cache_clear()

    response = client.post("/api/auth/guest", json={"turnstileToken": "tok"})

    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{config.SECURE_SESSION_COOKIE_NAME}=")
    assert "Secure" in set_cookie


def test_create_guest_is_idempotent_with_existing_session(
    client: TestClient, db_admin: psycopg.Connection[Any], turnstile: FakeTurnstile
) -> None:
    first = login_guest(client)
    second = client.post("/api/auth/guest", json={"turnstileToken": "tok"}).json()["user"]

    assert second["id"] == first["id"]
    assert db_admin.execute("select count(*) from idea_ws.users").fetchone() == (1,)
    assert len(turnstile.calls) == 1


def test_create_guest_rejects_failed_turnstile(
    client: TestClient, db_admin: psycopg.Connection[Any], turnstile: FakeTurnstile
) -> None:
    turnstile.ok = False
    response = client.post("/api/auth/guest", json={"turnstileToken": "bad"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "turnstile_failed"
    assert COOKIE not in client.cookies
    assert db_admin.execute("select count(*) from idea_ws.users").fetchone() == (0,)


def test_create_guest_requires_token(client: TestClient) -> None:
    assert client.post("/api/auth/guest", json={}).status_code == 422
    assert client.post("/api/auth/guest", json={"turnstileToken": ""}).status_code == 422


def test_create_guest_is_rate_limited_per_ip(client: TestClient) -> None:
    for _ in range(config.GUEST_CREATE_RATE_LIMIT):
        assert client.post("/api/auth/guest", json={"turnstileToken": "tok"}).status_code == 200
        client.cookies.clear()

    response = client.post("/api/auth/guest", json={"turnstileToken": "tok"})
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "rate_limited"


def test_rate_limit_key_does_not_contain_raw_ip(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    login_guest(client)
    [(key,)] = db_admin.execute("select key from idea_ws.rate_limit_buckets").fetchall()
    assert "testclient" not in key
    assert key == f"guest_create:{security.hash_ip('testclient').hex()}"


def test_unconfigured_turnstile_fails_closed(client: TestClient) -> None:
    from backend.app.main import app
    from backend.app.services.turnstile import get_turnstile_verifier

    app.dependency_overrides.pop(get_turnstile_verifier)
    response = client.post("/api/auth/guest", json={"turnstileToken": "tok"})
    assert response.status_code == 403


# ---------------------------------------------------------------- me / logout


def test_me_requires_session(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


def test_me_returns_current_user(client: TestClient) -> None:
    user = login_guest(client)
    assert client.get("/api/auth/me").json() == {"user": {"id": user["id"], "isGuest": True}}


def test_unknown_token_is_rejected(client: TestClient) -> None:
    client.cookies.set(COOKIE, "forged")
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    login_guest(client)
    db_admin.execute("update idea_ws.sessions set expires_at = now() - interval '1 second'")
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_session_and_clears_cookie(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    login_guest(client)
    token = client.cookies[COOKIE]

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert f'{COOKIE}=""' in response.headers["set-cookie"] or "Max-Age=0" in response.headers["set-cookie"]
    [(_, revoked_at, _)] = session_rows(db_admin)
    assert revoked_at is not None

    # 古いトークンを持ち続けても使えない
    client.cookies.set(COOKIE, token)
    assert client.get("/api/auth/me").status_code == 401


def test_logout_without_session_is_ok(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_session_touch_is_throttled(client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    login_guest(client)
    db_admin.execute(
        "update idea_ws.sessions set last_seen_at = now() - interval '5 minutes', expires_at = now() + interval '1 day'"
    )
    db_admin.execute("update idea_ws.users set last_active_at = now() - interval '5 minutes'")

    response = client.get("/api/auth/me")
    assert "set-cookie" not in response.headers
    assert db_admin.execute("select expires_at < now() + interval '2 days' from idea_ws.sessions").fetchone() == (True,)

    db_admin.execute("update idea_ws.sessions set last_seen_at = now() - interval '11 minutes'")
    db_admin.execute("update idea_ws.users set last_active_at = now() - interval '11 minutes'")

    response = client.get("/api/auth/me")
    assert "set-cookie" in response.headers  # 有効期限を延ばした Cookie を再発行
    assert db_admin.execute(
        "select expires_at > now() + interval '179 days', last_seen_at > now() - interval '1 minute' "
        "from idea_ws.sessions"
    ).fetchone() == (True, True)
    assert db_admin.execute("select last_active_at > now() - interval '1 minute' from idea_ws.users").fetchone() == (
        True,
    )


# ---------------------------------------------------------------- Origin（CSRF）


@pytest.mark.parametrize("origin", [None, "https://evil.example.com", "http://localhost:3000.evil.com"])
@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/auth/guest", {"turnstileToken": "tok"}),
        ("/api/auth/logout", None),
        ("/api/structure-rough-note", {"content": "x"}),
        ("/api/generate-prd", {"notes": [{"id": "n", "content": "x"}]}),
    ],
)
def test_unsafe_requests_require_allowed_origin(
    client: TestClient, origin: str | None, path: str, body: dict[str, Any] | None
) -> None:
    headers = {"Origin": origin} if origin else {}
    if origin is None:
        client.headers.pop("Origin")
    response = client.post(path, json=body, headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "invalid_origin"


def test_get_requests_do_not_require_origin(client: TestClient) -> None:
    client.headers.pop("Origin")
    assert client.get("/api/health").status_code == 200
