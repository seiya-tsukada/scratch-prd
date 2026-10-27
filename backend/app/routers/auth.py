"""ゲスト発行・登録・ログイン（ゲストデータの統合）・現在のユーザー・ログアウト"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app import config, security
from backend.app.db import Conn, Db
from backend.app.models.auth import GuestRequest, LoginRequest, MeResponse, MeUser, RegisterRequest
from backend.app.services import accounts
from backend.app.services.events import record_event
from backend.app.services.rate_limit import consume_rate_limit, enforce_rate_limit
from backend.app.services.samples import copy_active_sample
from backend.app.services.turnstile import TurnstileVerifier, get_turnstile_verifier
from backend.app.sessions import CurrentUser, OptionalUser, SessionUser, create_session, revoke_session, session_ttl

router = APIRouter(prefix="/auth", dependencies=[Depends(security.verify_origin)])

Turnstile = Annotated[TurnstileVerifier, Depends(get_turnstile_verifier)]


def me_response(user: SessionUser) -> MeResponse:
    return MeResponse(
        user=MeUser(
            id=user.user_id,
            is_guest=user.is_guest,
            email=user.email,
            display_name=user.display_name,
            onboarding_done=user.onboarding_done,
        )
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
    await record_event(db, user_id, "guest_created")
    return MeResponse(user=MeUser(id=user_id, is_guest=True))


async def start_session(
    db: Conn, request: Request, response: Response, user_id: UUID, *, previous: SessionUser | None
) -> None:
    """ログイン・登録のたびにセッションを作り直す（セッション固定攻撃対策）。呼び出し側のトランザクション内で実行する"""
    if previous is not None:
        await revoke_session(db, previous.session_id)
    token = await create_session(db, user_id, is_guest=False, request=request)
    security.set_session_cookie(response, token, session_ttl(is_guest=False))


def _client_ip_or_unknown(request: Request) -> str:
    return security.client_ip(request) or "unknown"


@router.post("/register", response_model_exclude_none=True)
async def register(
    body: RegisterRequest, request: Request, response: Response, db: Db, user: CurrentUser
) -> MeResponse:
    """今のゲストを正規ユーザーにする。データはそのまま（同じ users 行を昇格させる）"""
    if not user.is_guest:
        raise HTTPException(status_code=409, detail={"code": "already_registered"})
    await enforce_rate_limit(db, "register_ip", _client_ip_or_unknown(request), config.REGISTER_RATE_LIMIT_PER_IP)

    try:
        async with db.transaction():
            await accounts.register_guest(db, user.user_id, body.email, body.password, body.display_name)
            await start_session(db, request, response, user.user_id, previous=user)
    except accounts.EmailTakenError as e:
        raise HTTPException(status_code=409, detail={"code": "email_taken"}) from e
    except accounts.AlreadyRegisteredError as e:
        raise HTTPException(status_code=409, detail={"code": "already_registered"}) from e

    await record_event(db, user.user_id, "signup_completed", {"method": "password"})
    display_name = body.display_name or user.display_name
    return MeResponse(
        user=MeUser(
            id=user.user_id,
            is_guest=False,
            email=body.email,
            display_name=display_name,
            onboarding_done=user.onboarding_done,
        )
    )


@router.post("/login", response_model_exclude_none=True)
async def login(body: LoginRequest, request: Request, response: Response, db: Db, current: OptionalUser) -> MeResponse:
    """メールアドレス + パスワードでログインする。
    今のセッションがデータのあるゲストなら、guestData（merge / discard）の指定が無い限り 409 guest_data_exists を返す"""
    await enforce_rate_limit(db, "login_ip", _client_ip_or_unknown(request), config.LOGIN_RATE_LIMIT_PER_IP)
    await enforce_rate_limit(db, "login_email", body.email, config.LOGIN_RATE_LIMIT_PER_EMAIL)

    creds = await accounts.authenticate(db, body.email, body.password)
    if creds is None:
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})

    guest = current if current is not None and current.is_guest else None
    if guest is not None and body.guest_data is None:
        summary = await accounts.guest_data_summary(db, guest.user_id)
        if not summary.is_empty:
            raise HTTPException(
                status_code=409,
                detail={"code": "guest_data_exists", "projects": summary.projects, "notes": summary.notes},
            )

    async with db.transaction():
        if guest is not None:
            # ゲストのセッションはゲストの削除と一緒に消える
            await accounts.resolve_guest(db, guest.user_id, creds.user_id, body.guest_data or "discard")
            await start_session(db, request, response, creds.user_id, previous=None)
        else:
            await start_session(db, request, response, creds.user_id, previous=current)
        await db.execute("update idea_ws.users set last_active_at = now() where id = %s", (creds.user_id,))

    if guest is not None and body.guest_data == "merge":
        await record_event(db, creds.user_id, "account_merged")

    return MeResponse(
        user=MeUser(
            id=creds.user_id,
            is_guest=False,
            email=creds.email,
            display_name=creds.display_name,
            onboarding_done=creds.onboarding_done,
        )
    )


@router.get("/me", response_model_exclude_none=True)
async def me(user: CurrentUser) -> MeResponse:
    return me_response(user)


@router.post("/logout", status_code=204)
async def logout(response: Response, db: Db, user: OptionalUser) -> None:
    """セッションを失効させる。以後は新しいゲストとして始まる"""
    if user is not None:
        await revoke_session(db, user.session_id)
    security.clear_session_cookie(response)
