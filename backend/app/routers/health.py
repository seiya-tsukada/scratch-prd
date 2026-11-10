"""死活監視。DB へ select 1 を投げて接続を確認する（docker compose の healthcheck・デプロイ後の確認・外形監視用）"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.app import config
from backend.app.db import Pool

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", response_model=None)
async def health(pool: Pool) -> dict[str, str] | JSONResponse:
    try:
        async with pool.connection(timeout=config.HEALTH_DB_TIMEOUT_SECONDS) as conn:
            cur = await conn.execute("select 1 as ok")
            row = await cur.fetchone()
        if row is None or row["ok"] != 1:
            raise RuntimeError("select 1 returned an unexpected result")
    except Exception:
        # 接続文字列などを応答に含めない（詳細はログだけに出す）
        logger.exception("health check: DB に接続できません")
        return JSONResponse(status_code=503, content={"status": "error", "db": "unavailable"})
    return {"status": "ok", "db": "ok", "time": datetime.now(UTC).isoformat()}
