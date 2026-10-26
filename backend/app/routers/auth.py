"""ゲスト発行・現在のユーザー・ログアウト"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app import config, security
from backend.app.db import Db
from backend.app.models.auth import GuestRequest, MeResponse, MeUser
from backend.app.services.rate_limit import consume_rate_limit
from backend.app.services.samples import copy_active_sample
from backend.app.services.turnstile import TurnstileVerifier, get_turnstile_verifier
from backend.app.sessions import CurrentUser, OptionalUser, SessionUser, create_session, revoke_session, session_ttl

router = APIRouter(prefix="/auth", dependencies=[Depends(security.verify_origin)])

Turnstile = Annotated[TurnstileVerifier, Depends(get_turnstile_verifier)]


def me_response(user: SessionUser) -> MeResponse:
    return MeResponse(
        user=MeUser(id=user.user_id, is_guest=user.is_guest, email=user.email, display_name=user.display_name)
    )


@router.post("/guest", response_model_exclude_none=True)
async def create_guest(
    body: GuestRequest, request: Request, response: Response, db: Db, existing: OptionalUser, turnstile: Turnstile
) -> MeResponse:
    """ゲストユーザーを作り、サンプルを複製してセッションを発行する。既にセッションがあればそのユーザーを返す"""
    if existing is not None:
        return me_response(existing)

    ip = security.client_ip(request)
    if ip:
        key = f"guest_create:{security.hash_ip(ip).hex()}"
        allowed = await consume_rate_limit(
            db, key, config.GUEST_CREATE_RATE_WINDOW_SECONDS, config.GUEST_CREATE_RATE_LIMIT
        )
        if not allowed:
            raise HTTPException(status_code=429, detail={"code": "rate_limited"})

    if not await turnstile.verify(body.turnstile_token, ip):
        raise HTTPException(status_code=403, detail={"code": "turnstile_failed"})

    async with db.transaction():
        cur = await db.execute("insert into idea_ws.users (is_guest) values (true) returning id")
        row = await cur.fetchone()
        assert row is not None
        user_id = UUID(str(row["id"]))
        await copy_active_sample(db, user_id)
        token = await create_session(db, user_id, is_guest=True, request=request)

    security.set_session_cookie(response, token, session_ttl(is_guest=True))
    return MeResponse(user=MeUser(id=user_id, is_guest=True))


@router.get("/me", response_model_exclude_none=True)
async def me(user: CurrentUser) -> MeResponse:
    return me_response(user)


@router.post("/logout", status_code=204)
async def logout(response: Response, db: Db, user: OptionalUser) -> None:
    """セッションを失効させる。以後は新しいゲストとして始まる"""
    if user is not None:
        await revoke_session(db, user.session_id)
    security.clear_session_cookie(response)
