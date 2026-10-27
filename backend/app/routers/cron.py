"""Vercel Cron から呼ばれる定期処理。CRON_SECRET を Authorization: Bearer で受け取る"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, HTTPException, Request

from backend.app import config
from backend.app.db import Db

router = APIRouter(prefix="/cron")

INACTIVE_GUEST_DAYS = 30


def verify_cron_secret(request: Request) -> None:
    secret = config.get_settings().cron_secret
    expected = f"Bearer {secret.get_secret_value()}" if secret else None
    provided = request.headers.get("authorization", "")
    if expected is None or not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


@router.get("/cleanup")
async def cleanup(request: Request, db: Db) -> dict[str, int]:
    """アクセスの無いゲストと、期限切れのセッション・トークン・古いレート制限の記録を削除する"""
    verify_cron_secret(request)
    cur = await db.execute("select idea_ws.cleanup_inactive_guests(%s) as guests", (INACTIVE_GUEST_DAYS,))
    guests = await cur.fetchone()
    cur = await db.execute("select * from idea_ws.cleanup_expired_auth()")
    auth = await cur.fetchone()
    assert guests is not None and auth is not None
    return {"guestsDeleted": int(guests["guests"]), **{_camel(k): int(v) for k, v in auth.items()}}


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)
