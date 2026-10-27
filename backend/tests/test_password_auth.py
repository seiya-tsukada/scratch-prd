"""メールアドレス + パスワードの登録・ログイン・ゲストの統合・アカウント設定・Cron"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config

from .conftest import login_guest

PASSWORD = "correct horse battery"
COOKIE = config.SESSION_COOKIE_NAME


def register(client: TestClient, email: str = "alice@example.com", password: str = PASSWORD, **extra: Any) -> Any:
    return client.post("/api/auth/register", json={"email": email, "password": password, **extra})


def login(client: TestClient, email: str = "alice@example.com", password: str = PASSWORD, **extra: Any) -> Any:
    return client.post("/api/auth/login", json={"email": email, "password": password, **extra})


def notes_of(client: TestClient) -> list[str]:
    data = client.get("/api/workspace/bootstrap").json().get("data") or {"notes": []}
    return [n["content"] for n in data["notes"]]


def add_note(client: TestClient, content: str) -> None:
    body = client.get("/api/workspace/bootstrap").json()
    section = body["data"]["sections"][0]["id"]
    response = client.post(
        f"/api/projects/{body['currentProjectId']}/notes", json={"sectionId": section, "content": content}
    )
    assert response.status_code == 201


@pytest.fixture
def registered(guest_client: TestClient) -> TestClient:
    """alice@example.com として登録済み（ゲスト時代のメモ「alice のメモ」を持つ）"""
    add_note(guest_client, "alice のメモ")
    assert register(guest_client, display_name="Alice").status_code == 200
    return guest_client


# ---------------------------------------------------------------- 登録


def test_register_promotes_same_user_and_keeps_data(
    guest_client: TestClient, db_admin: psycopg.Connection[Any]
) -> None:
    guest_id = guest_client.get("/api/auth/me").json()["user"]["id"]
    add_note(guest_client, "ゲストのメモ")
    old_token = guest_client.cookies[COOKIE]

    response = register(guest_client, email="  Alice@Example.COM ", display_name="  Alice ")

    assert response.status_code == 200
    assert response.json()["user"] == {
        "id": guest_id,
        "isGuest": False,
        "email": "alice@example.com",
        "displayName": "Alice",
    }
    # セッションは作り直され、古いトークンは使えない
    assert guest_client.cookies[COOKIE] != old_token
    assert "ゲストのメモ" in notes_of(guest_client)
    stale = TestClient(guest_client.app, headers={"Origin": "http://localhost:3000"})
    stale.cookies.set(COOKIE, old_token)
    assert stale.get("/api/auth/me").status_code == 401

    row = db_admin.execute(
        "select u.is_guest, u.email::text, i.provider, i.provider_subject, pc.password_hash like '$argon2id$%%' "
        "from idea_ws.users u join idea_ws.user_identities i on i.user_id = u.id "
        "join idea_ws.password_credentials pc on pc.user_id = u.id where u.id = %s",
        (guest_id,),
    ).fetchone()
    assert row == (False, "alice@example.com", "password", "alice@example.com", True)
    assert PASSWORD not in str(db_admin.execute("select password_hash from idea_ws.password_credentials").fetchall())


def test_registered_session_uses_registered_ttl(registered: TestClient) -> None:
    max_age = int(config.SESSION_TTL["registered"].total_seconds())
    assert login(registered).headers["set-cookie"].count(f"Max-Age={max_age}") == 1


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "a@b", "password": PASSWORD},
        {"email": "a" * 250 + "@example.com", "password": PASSWORD},
        {"email": "a@example.com", "password": "short"},
        {"email": "a@example.com", "password": "x" * (config.MAX_PASSWORD_CHARS + 1)},
        {"email": "a@example.com", "password": "Password123"},
        {"email": "a@example.com", "password": "aaaaaaaaaaaa"},
    ],
)
def test_register_validates_email_and_password(guest_client: TestClient, body: dict[str, str]) -> None:
    assert guest_client.post("/api/auth/register", json=body).status_code == 422


def test_register_rejects_taken_email_case_insensitively(registered: TestClient, make_client: Any) -> None:
    other = make_client()
    login_guest(other)
    response = register(other, email="ALICE@example.com")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "email_taken"


def test_register_twice_is_rejected(registered: TestClient) -> None:
    response = register(registered, email="another@example.com")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "already_registered"


def test_register_requires_session(client: TestClient) -> None:
    assert register(client).status_code == 401


def test_register_is_rate_limited_per_ip(client: TestClient, make_client: Any) -> None:
    limit = config.REGISTER_RATE_LIMIT_PER_IP[0]
    for i in range(limit):
        c = make_client()
        login_guest(c)
        assert register(c, email=f"user{i}@example.com").status_code == 200
    c = make_client()
    login_guest(c)
    assert register(c, email="one-more@example.com").status_code == 429


# ---------------------------------------------------------------- ログイン


def test_login_from_another_browser_sees_same_data(registered: TestClient, make_client: Any) -> None:
    """シナリオ: ゲストで作成 → 登録 → 別ブラウザでログイン → 同じデータが見える"""
    other = make_client()  # まだゲストもいない新しいブラウザ
    response = login(other, email="Alice@Example.com")

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "alice@example.com"
    assert "alice のメモ" in notes_of(other)
    assert notes_of(other) == notes_of(registered)


@pytest.mark.parametrize(
    ("email", "password"), [("alice@example.com", "wrong password!"), ("nobody@example.com", PASSWORD)]
)
def test_login_failure_does_not_reveal_which_part_is_wrong(
    registered: TestClient, make_client: Any, email: str, password: str
) -> None:
    response = login(make_client(), email=email, password=password)
    assert response.status_code == 401
    assert response.json()["detail"] == {"code": "invalid_credentials"}


def test_guest_cannot_log_in_with_password(guest_client: TestClient, make_client: Any) -> None:
    # パスワードを持たないゲストはログイン対象にならない
    assert login(make_client(), email="guest@example.com").status_code == 401


def test_login_is_rate_limited_per_email(registered: TestClient, make_client: Any) -> None:
    other = make_client()
    for _ in range(config.LOGIN_RATE_LIMIT_PER_EMAIL[0]):
        assert login(other, password="wrong password!").status_code == 401
    # 正しいパスワードでも、上限に達したら一定時間は受け付けない
    assert login(other).status_code == 429


def test_guest_with_data_must_choose_merge_or_discard(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    other = make_client()
    login_guest(other)
    guest_id = other.get("/api/auth/me").json()["user"]["id"]

    response = login(other)

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "guest_data_exists"
    assert detail["projects"] == 1 and detail["notes"] == 5
    # まだログインしていない（ゲストのまま）
    assert other.get("/api/auth/me").json()["user"]["id"] == guest_id


def test_login_merge_moves_guest_data_into_account(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    """シナリオ: ゲストで作成 → 既存アカウントでログイン → 統合"""
    other = make_client()
    login_guest(other)
    add_note(other, "別ブラウザのゲストのメモ")
    guest_id = other.get("/api/auth/me").json()["user"]["id"]
    db_admin.execute("insert into idea_ws.events (user_id, event_name) values (%s, 'guest_created')", (guest_id,))
    owner_id = registered.get("/api/auth/me").json()["user"]["id"]

    response = login(other, guestData="merge")

    assert response.status_code == 200
    assert response.json()["user"]["id"] == owner_id
    projects = other.get("/api/projects").json()
    assert len(projects) == 2
    contents = [n["content"] for p in projects for n in other.get(f"/api/projects/{p['id']}/data").json()["notes"]]
    assert "alice のメモ" in contents and "別ブラウザのゲストのメモ" in contents
    # ゲストは消え、計測データは引き継がれる
    assert db_admin.execute("select count(*) from idea_ws.users where id = %s", (guest_id,)).fetchone() == (0,)
    assert db_admin.execute("select user_id::text from idea_ws.events").fetchone() == (owner_id,)
    # もとのブラウザからも統合したデータが見える
    assert len(registered.get("/api/projects").json()) == 2


def test_login_discard_deletes_guest_data(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    other = make_client()
    login_guest(other)
    add_note(other, "捨てるメモ")
    guest_id = other.get("/api/auth/me").json()["user"]["id"]

    assert login(other, guestData="discard").status_code == 200

    assert "捨てるメモ" not in str(other.get("/api/workspace/bootstrap").json())
    assert db_admin.execute("select count(*) from idea_ws.users where id = %s", (guest_id,)).fetchone() == (0,)
    assert db_admin.execute("select count(*) from idea_ws.notes where content = '捨てるメモ'").fetchone() == (0,)


def test_merge_does_not_touch_other_users(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    bystander = make_client()
    login_guest(bystander)
    add_note(bystander, "無関係なゲストのメモ")
    before = bystander.get("/api/workspace/bootstrap").json()

    other = make_client()
    login_guest(other)
    login(other, guestData="merge")

    assert bystander.get("/api/workspace/bootstrap").json() == before


def test_merge_respects_project_limit(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    owner_id = registered.get("/api/auth/me").json()["user"]["id"]
    db_admin.execute(
        "insert into idea_ws.projects (user_id, name) select %s, 'p' || g from generate_series(2, %s) g",
        (owner_id, config.MAX_PROJECTS_PER_USER),
    )
    other = make_client()
    login_guest(other)
    guest_id = other.get("/api/auth/me").json()["user"]["id"]

    response = login(other, guestData="merge")

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "limit_exceeded"
    # 何も変わらず、ゲストのまま
    assert other.get("/api/auth/me").json()["user"]["id"] == guest_id


def test_login_rotates_session_for_already_logged_in_user(registered: TestClient) -> None:
    old = registered.cookies[COOKIE]
    assert login(registered).status_code == 200
    assert registered.cookies[COOKIE] != old


def test_rehash_on_login_when_parameters_change(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.app.services import passwords

    monkeypatch.setattr(passwords, "needs_rehash", lambda _hash: True)
    before = db_admin.execute("select password_hash from idea_ws.password_credentials").fetchone()
    assert login(make_client()).status_code == 200
    after = db_admin.execute("select password_hash from idea_ws.password_credentials").fetchone()
    assert before != after


# ---------------------------------------------------------------- アカウント設定


def test_update_display_name(registered: TestClient) -> None:
    response = registered.patch("/api/account", json={"displayName": "  新しい名前 "})
    assert response.json()["user"]["displayName"] == "新しい名前"
    assert registered.get("/api/auth/me").json()["user"]["displayName"] == "新しい名前"
    registered.patch("/api/account", json={"displayName": "  "})
    assert "displayName" not in registered.get("/api/auth/me").json()["user"]


def test_change_password_revokes_other_sessions(registered: TestClient, make_client: Any) -> None:
    other = make_client()
    login(other)

    wrong = registered.post(
        "/api/account/password", json={"currentPassword": "nope nope nope", "newPassword": "brand new password"}
    )
    assert wrong.status_code == 403

    ok = registered.post(
        "/api/account/password", json={"currentPassword": PASSWORD, "newPassword": "brand new password"}
    )
    assert ok.status_code == 204
    assert registered.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    assert login(make_client(), password="brand new password").status_code == 200
    assert login(make_client()).status_code == 401


def test_guest_cannot_change_password(guest_client: TestClient) -> None:
    response = guest_client.post(
        "/api/account/password", json={"currentPassword": "x", "newPassword": "brand new password"}
    )
    assert response.status_code == 409


def test_delete_account_removes_all_data(
    registered: TestClient, make_client: Any, db_admin: psycopg.Connection[Any]
) -> None:
    """シナリオ: アカウント削除で全データが消える"""
    user_id = registered.get("/api/auth/me").json()["user"]["id"]
    other_session = make_client()
    login(other_session)

    assert registered.request("DELETE", "/api/account", json={"password": "wrong password!"}).status_code == 403
    response = registered.request("DELETE", "/api/account", json={"password": PASSWORD})

    assert response.status_code == 204
    for table in ["users", "projects", "notes", "sessions", "user_identities", "password_credentials"]:
        column = "id" if table == "users" else "user_id"
        count = db_admin.execute(f"select count(*) from idea_ws.{table} where {column} = %s", (user_id,)).fetchone()
        assert count == (0,), table
    assert other_session.get("/api/auth/me").status_code == 401
    assert login(make_client()).status_code == 401


def test_guest_can_delete_this_browsers_data(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    user_id = guest_client.get("/api/auth/me").json()["user"]["id"]
    assert guest_client.request("DELETE", "/api/account", json={}).status_code == 204
    assert db_admin.execute("select count(*) from idea_ws.users where id = %s", (user_id,)).fetchone() == (0,)
    assert guest_client.get("/api/auth/me").status_code == 401


def test_account_endpoints_require_origin(registered: TestClient) -> None:
    registered.headers.pop("Origin")
    assert registered.patch("/api/account", json={"displayName": "x"}).status_code == 403
    assert registered.request("DELETE", "/api/account", json={"password": PASSWORD}).status_code == 403


# ---------------------------------------------------------------- Cron


def test_cron_requires_secret(client: TestClient) -> None:
    assert client.get("/api/cron/cleanup").status_code == 401
    assert client.get("/api/cron/cleanup", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_cron_cleans_up(
    client: TestClient, db_admin: psycopg.Connection[Any], make_client: Callable[[], TestClient]
) -> None:
    stale = make_client()
    login_guest(stale)
    db_admin.execute(
        "update idea_ws.users set last_active_at = now() - interval '60 days'; "
        "update idea_ws.sessions set expires_at = now() - interval '1 day'"
    )

    response = client.get("/api/cron/cleanup", headers={"Authorization": "Bearer test-cron-secret-0123456789"})

    assert response.status_code == 200
    body = response.json()
    assert body["guestsDeleted"] == 1
    assert body["sessionsDeleted"] == 0  # ゲストと一緒に cascade で消えている
    assert db_admin.execute("select count(*) from idea_ws.users").fetchone() == (0,)
