"""計測イベントの受信（画面上の操作のみ。API で起きる出来事はサーバー側で記録している）"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app import config, security
from backend.app.db import Db
from backend.app.models.events import ClientEvent
from backend.app.services.events import record_event
from backend.app.services.rate_limit import enforce_rate_limit
from backend.app.sessions import CurrentUser

router = APIRouter(dependencies=[Depends(security.verify_origin)])


@router.post("/events", status_code=204)
async def post_event(body: ClientEvent, user: CurrentUser, db: Db) -> None:
    await enforce_rate_limit(db, "events_session", str(user.session_id), config.EVENTS_RATE_LIMIT_PER_SESSION)
    await record_event(db, user.user_id, body.name, body.properties, session_id=user.session_id)
