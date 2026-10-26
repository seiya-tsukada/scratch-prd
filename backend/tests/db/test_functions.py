"""consume_quota / consume_rate_limit / 掃除関数"""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import psycopg
import pytest

from .helpers import create_user


def consume_quota(conn: psycopg.Connection, user_id: UUID, kind: str, limit: int) -> bool:
    row = conn.execute("select idea_ws.consume_quota(%s, %s, %s)", (user_id, kind, limit)).fetchone()
    assert row is not None
    return bool(row[0])


def consume_rate_limit(conn: psycopg.Connection, key: str, window_seconds: int, limit: int) -> bool:
    row = conn.execute("select idea_ws.consume_rate_limit(%s, %s, %s)", (key, window_seconds, limit)).fetchone()
    assert row is not None
    return bool(row[0])


# ---------------------------------------------------------------- consume_quota


def test_consume_quota_stops_at_limit(app: psycopg.Connection) -> None:
    user = create_user(app)
    assert [consume_quota(app, user, "prd", 3) for _ in range(5)] == [True, True, True, False, False]
    assert app.execute("select count from idea_ws.api_usage where user_id = %s", (user,)).fetchone() == (3,)


def test_consume_quota_counts_per_kind_and_user(app: psycopg.Connection) -> None:
    alice = create_user(app)
    bob = create_user(app)
    assert consume_quota(app, alice, "prd", 1)
    assert not consume_quota(app, alice, "prd", 1)
    assert consume_quota(app, alice, "structure", 1)
    assert consume_quota(app, bob, "prd", 1)


def test_consume_quota_rejects_non_positive_limit(app: psycopg.Connection) -> None:
    user = create_user(app)
    assert not consume_quota(app, user, "prd", 0)
    assert app.execute("select count(*) from idea_ws.api_usage where user_id = %s", (user,)).fetchone() == (0,)


def test_consume_quota_uses_jst_date(app: psycopg.Connection) -> None:
    user = create_user(app)
    consume_quota(app, user, "prd", 1)
    row = app.execute(
        "select usage_date = (now() at time zone 'Asia/Tokyo')::date from idea_ws.api_usage where user_id = %s",
        (user,),
    ).fetchone()
    assert row == (True,)


def test_consume_quota_previous_day_does_not_count(app: psycopg.Connection) -> None:
    user = create_user(app)
    app.execute(
        "insert into idea_ws.api_usage (user_id, usage_date, kind, count) "
        "values (%s, (now() at time zone 'Asia/Tokyo')::date - 1, 'prd', 10)",
        (user,),
    )
    assert consume_quota(app, user, "prd", 1)


@pytest.fixture
def committed_user(database_url: str) -> Iterator[UUID]:
    """並行実行テスト用に、コミット済みのユーザーを作り、終了時に削除する"""
    with psycopg.connect(database_url, autocommit=True) as conn:
        user = create_user(conn)
    yield user
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("delete from idea_ws.users where id = %s", (user,))


def test_consume_quota_is_atomic_under_concurrency(app_database_url: str, committed_user: UUID) -> None:
    limit = 5

    def attempt(_: int) -> bool:
        with psycopg.connect(app_database_url, autocommit=True) as conn:
            return consume_quota(conn, committed_user, "prd", limit)

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(attempt, range(30)))

    assert results.count(True) == limit


# ---------------------------------------------------------------- consume_rate_limit


def test_consume_rate_limit_stops_at_limit(app: psycopg.Connection) -> None:
    key = f"guest:{uuid4()}"
    assert [consume_rate_limit(app, key, 3600, 2) for _ in range(3)] == [True, True, False]
    assert consume_rate_limit(app, f"guest:{uuid4()}", 3600, 2)


def test_consume_rate_limit_window_is_aligned(app: psycopg.Connection) -> None:
    key = f"guest:{uuid4()}"
    consume_rate_limit(app, key, 60, 1)
    row = app.execute(
        "select window_start = to_timestamp(floor(extract(epoch from now()) / 60) * 60) "
        "from idea_ws.rate_limit_buckets where key = %s",
        (key,),
    ).fetchone()
    assert row == (True,)


def test_consume_rate_limit_previous_window_does_not_count(app: psycopg.Connection) -> None:
    key = f"guest:{uuid4()}"
    app.execute(
        "insert into idea_ws.rate_limit_buckets (key, window_start, count) "
        "values (%s, to_timestamp(floor(extract(epoch from now()) / 60) * 60) - interval '60 seconds', 5)",
        (key,),
    )
    assert consume_rate_limit(app, key, 60, 1)


def test_consume_rate_limit_rejects_invalid_window(app: psycopg.Connection) -> None:
    with pytest.raises(psycopg.errors.RaiseException), app.transaction():
        consume_rate_limit(app, "k", 0, 1)


# ---------------------------------------------------------------- cleanup


def make_guest(conn: psycopg.Connection, *, inactive_days: int, session: str | None = None) -> UUID:
    """session: None（なし）/ 'valid' / 'expired' / 'revoked'"""
    user = create_user(conn)
    conn.execute(
        "update idea_ws.users set last_active_at = now() - make_interval(days => %s) where id = %s",
        (inactive_days, user),
    )
    if session is not None:
        conn.execute(
            "insert into idea_ws.sessions (user_id, token_hash, expires_at, revoked_at) values (%s, %s, %s, %s)",
            (
                user,
                uuid4().bytes,
                "infinity" if session in ("valid", "revoked") else "-infinity",
                "now" if session == "revoked" else None,
            ),
        )
    return user


def existing(conn: psycopg.Connection, user_ids: list[UUID]) -> set[UUID]:
    rows = conn.execute("select id from idea_ws.users where id = any(%s)", (user_ids,)).fetchall()
    return {UUID(str(r[0])) for r in rows}


def test_cleanup_inactive_guests(app: psycopg.Connection) -> None:
    inactive_no_session = make_guest(app, inactive_days=31)
    inactive_expired = make_guest(app, inactive_days=31, session="expired")
    inactive_revoked = make_guest(app, inactive_days=31, session="revoked")
    inactive_valid = make_guest(app, inactive_days=31, session="valid")
    recent = make_guest(app, inactive_days=1)
    registered = create_user(app, is_guest=False, email=f"{uuid4()}@example.com")
    app.execute("update idea_ws.users set last_active_at = now() - interval '365 days' where id = %s", (registered,))
    all_users = [inactive_no_session, inactive_expired, inactive_revoked, inactive_valid, recent, registered]

    deleted = app.execute("select idea_ws.cleanup_inactive_guests(30)").fetchone()

    assert deleted == (3,)
    assert existing(app, all_users) == {inactive_valid, recent, registered}


def test_cleanup_expired_auth(app: psycopg.Connection) -> None:
    user = create_user(app)
    for expires_at, revoked_at in [("infinity", None), ("-infinity", None), ("infinity", "now")]:
        app.execute(
            "insert into idea_ws.sessions (user_id, token_hash, expires_at, revoked_at) values (%s, %s, %s, %s)",
            (user, uuid4().bytes, expires_at, revoked_at),
        )
    for expires_at, used_at in [("infinity", None), ("-infinity", None), ("infinity", "now")]:
        app.execute(
            "insert into idea_ws.email_login_tokens (email, token_hash, expires_at, used_at) "
            "values ('a@example.com', %s, %s, %s)",
            (uuid4().bytes, expires_at, used_at),
        )
    for expires_at in ["infinity", "-infinity"]:
        app.execute(
            "insert into idea_ws.oauth_states (state_hash, code_verifier, expires_at) values (%s, 'v', %s)",
            (uuid4().bytes, expires_at),
        )
    for window_start in ["now", "-infinity"]:
        app.execute(
            "insert into idea_ws.rate_limit_buckets (key, window_start, count) values (%s, %s, 1)",
            (str(uuid4()), window_start),
        )

    result = app.execute("select * from idea_ws.cleanup_expired_auth()").fetchone()

    assert result == (2, 2, 1, 1)
    for table in ["sessions", "email_login_tokens", "oauth_states"]:
        assert app.execute(f"select count(*) from idea_ws.{table}").fetchone() == (1,), table
