"""集計ビュー: ファネルとフォールバック率"""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from .helpers import create_user


def add_event(conn: psycopg.Connection, user: object, name: str, when: str = "now()") -> None:
    conn.execute(
        f"insert into idea_ws.events (user_id, event_name, properties, created_at) values (%s, %s, %s, {when})",
        (user, name, Jsonb({})),
    )


def test_funnel_counts_each_user_once_per_step(admin: psycopg.Connection) -> None:
    admin.execute("delete from idea_ws.events")
    a, b, c = create_user(admin), create_user(admin), create_user(admin)
    for user in (a, b, c):
        add_event(admin, user, "guest_created")
    add_event(admin, a, "note_created")
    add_event(admin, a, "note_created")
    add_event(admin, b, "note_created")
    add_event(admin, a, "prd_generated")
    add_event(admin, a, "signup_completed")

    rows = admin.execute(
        "select guests_created, created_note, generated_prd, signed_up from idea_ws.funnel_daily"
    ).fetchall()
    assert rows == [(3, 2, 1, 1)]


def test_funnel_groups_by_jst_day_of_guest_creation(admin: psycopg.Connection) -> None:
    admin.execute("delete from idea_ws.events")
    user = create_user(admin)
    # UTC 15:30 は JST では翌日 0:30
    add_event(admin, user, "guest_created", "'2026-01-01T15:30:00Z'")
    add_event(admin, user, "note_created", "'2026-01-05T00:00:00Z'")
    rows = admin.execute("select day::text, guests_created, created_note from idea_ws.funnel_daily").fetchall()
    assert rows == [("2026-01-02", 1, 1)]


def test_ai_fallback_rate(admin: psycopg.Connection) -> None:
    admin.execute("delete from idea_ws.ai_generations")
    user = create_user(admin)
    for used_fallback, error_type in [
        (False, None),
        (False, None),
        (True, "ai_error:TimeoutError"),
        (True, "no_api_key"),
    ]:
        admin.execute(
            "insert into idea_ws.ai_generations (user_id, kind, used_fallback, error_type, latency_ms) "
            "values (%s, 'prd', %s, %s, 100)",
            (user, used_fallback, error_type),
        )
    row = admin.execute(
        "select total, fallbacks, fallback_rate_pct::float, no_api_key, ai_errors from idea_ws.ai_fallback_daily"
    ).fetchone()
    assert row == (4, 2, 50.0, 1, 1)
