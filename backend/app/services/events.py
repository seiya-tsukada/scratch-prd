"""グロース計測イベント（idea_ws.events）。

イベント名とプロパティはホワイトリスト制（EVENT_SCHEMAS）。メモ本文などの個人情報は入れない。
API で起きる出来事はサーバー側で記録し（偽装できない）、画面上の操作だけをフロントから受け付ける（CLIENT_EVENTS）。
記録に失敗しても本来の処理は止めない。
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from backend.app.db import Conn

logger = logging.getLogger(__name__)

PropertyRule = type[bool] | type[int] | frozenset[str]

GENERATION_MODES = frozenset({"strict", "suggest", "expand"})
DETAIL_LEVELS = frozenset({"brief", "standard", "detailed"})
AI_KINDS = frozenset({"structure", "prd"})
SIGNUP_METHODS = frozenset({"password"})
SIGNUP_PROMPT_TRIGGERS = frozenset({"first_prd", "note_count", "quota"})

EVENT_SCHEMAS: dict[str, dict[str, PropertyRule]] = {
    "app_opened": {},
    "guest_created": {},
    "note_created": {},
    "rough_note_structured": {"usedFallback": bool},
    "prd_generated": {"mode": GENERATION_MODES, "detailLevel": DETAIL_LEVELS, "noteCount": int, "usedFallback": bool},
    "prd_copied_for_ai": {},
    "prd_downloaded": {},
    "rate_limited": {"kind": AI_KINDS},
    "signup_prompt_shown": {"trigger": SIGNUP_PROMPT_TRIGGERS},
    "signup_started": {"method": SIGNUP_METHODS},
    "signup_completed": {"method": SIGNUP_METHODS},
    "account_merged": {},
    "local_data_imported": {"notes": int},
    "onboarding_started": {},
    "onboarding_completed": {},
    "onboarding_skipped": {},
    "quick_prd_used": {"structured": bool},
}

# フロントから送ってよいイベント（それ以外はサーバー側でのみ記録する）
CLIENT_EVENTS = frozenset(
    {
        "app_opened",
        "prd_copied_for_ai",
        "prd_downloaded",
        "signup_prompt_shown",
        "signup_started",
        "onboarding_started",
        "quick_prd_used",
    }
)


def validate_properties(name: str, properties: dict[str, Any]) -> dict[str, Any]:
    """スキーマに無いイベント・キー・値は ValueError"""
    schema = EVENT_SCHEMAS.get(name)
    if schema is None:
        raise ValueError(f"Unknown event: {name}")
    unknown = set(properties) - set(schema)
    if unknown:
        raise ValueError(f"Unknown properties for {name}: {sorted(unknown)}")
    for key, value in properties.items():
        rule = schema[key]
        if isinstance(rule, frozenset):
            ok = isinstance(value, str) and value in rule
        elif rule is int:
            ok = isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 1_000_000
        else:
            ok = isinstance(value, rule)
        if not ok:
            raise ValueError(f"Invalid value for {name}.{key}")
    return properties


async def record_event(
    target: Conn | AsyncConnectionPool[Conn],
    user_id: UUID | None,
    name: str,
    properties: dict[str, Any] | None = None,
    *,
    session_id: UUID | None = None,
) -> None:
    """イベントを記録する。target は接続かプール（外部 API を待つ処理ではプールを渡す）"""
    try:
        props = validate_properties(name, properties or {})
        query = "insert into idea_ws.events (user_id, session_id, event_name, properties) values (%s, %s, %s, %s)"
        params = (user_id, session_id, name, Jsonb(props))
        if isinstance(target, AsyncConnectionPool):
            async with target.connection() as conn:
                await conn.execute(query, params)
        else:
            await target.execute(query, params)
    except Exception as e:
        logger.warning("events: failed to record %s (%s)", name, type(e).__name__)
