"""AI 生成の記録（idea_ws.ai_generations）。記録に失敗しても応答は止めない"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from backend.app.db import Conn

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AiGenerationRecord:
    user_id: UUID
    kind: str
    input_chars: int
    latency_ms: int
    used_fallback: bool
    error_type: str | None = None
    model: str | None = None
    mode: str | None = None
    detail_level: str | None = None
    note_count: int | None = None


async def record_ai_generation(pool: AsyncConnectionPool[Conn], record: AiGenerationRecord) -> None:
    try:
        async with pool.connection() as conn:
            await conn.execute(
                """
            insert into idea_ws.ai_generations
              (user_id, kind, mode, detail_level, note_count, input_chars, latency_ms, used_fallback, error_type, model)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    record.user_id,
                    record.kind,
                    record.mode,
                    record.detail_level,
                    record.note_count,
                    record.input_chars,
                    record.latency_ms,
                    record.used_fallback,
                    record.error_type,
                    record.model,
                ),
            )
    except Exception as e:
        logger.warning("ai_generations: failed to record (%s)", type(e).__name__)
