"""日次クォータと IP 単位のレート制限（判定と加算は DB 関数でアトミックに行う）"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException

from backend.app import config, security
from backend.app.db import Conn


async def consume_quota(conn: Conn, user_id: UUID, kind: str, limit: int) -> bool:
    cur = await conn.execute("select idea_ws.consume_quota(%s, %s, %s) as ok", (user_id, kind, limit))
    row = await cur.fetchone()
    return bool(row and row["ok"])


async def consume_rate_limit(conn: Conn, key: str, window_seconds: int, limit: int) -> bool:
    cur = await conn.execute("select idea_ws.consume_rate_limit(%s, %s, %s) as ok", (key, window_seconds, limit))
    row = await cur.fetchone()
    return bool(row and row["ok"])


def ai_quota_limit(account_type: str, kind: config.AiKind) -> int:
    return config.AI_DAILY_QUOTAS[account_type][kind]


async def enforce_rate_limit(conn: Conn, purpose: str, value: str, rule: tuple[int, int]) -> None:
    """purpose + value（IP やメールアドレス）ごとの回数制限。値はハッシュ化してキーにする。超過は 429"""
    limit, window_seconds = rule
    key = f"{purpose}:{security.hash_ip(value).hex()}"
    if not await consume_rate_limit(conn, key, window_seconds, limit):
        raise HTTPException(status_code=429, detail={"code": "rate_limited"})
