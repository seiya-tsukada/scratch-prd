"""ゲスト発行・登録・ログイン（ゲストデータの統合）・現在のユーザー・ログアウト"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app import config, security
from backend.app.db import Conn, Db, Pool
from backend.app.models.auth import (
    LoginRequest,
    LoginVerifyRequest,
    MeResponse,
    MeUser,
    RegisterRequest,
    RegisterVerifyRequest,
    VerificationStarted,
)
from backend.app.services import accounts, email_codes, mailer, passwords
from backend.app.services.events import record_event
from backend.app.services.rate_limit import consume_rate_limit, enforce_rate_limit
from backend.app.services.samples import copy_active_sample
from backend.app.sessions import CurrentUser, OptionalUser, SessionUser, create_session, revoke_session, session_ttl

router = APIRouter(prefix="/auth", dependencies=[Depends(security.verify_origin)])


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
async def create_guest(request: Request, response: Response, db: Db, existing: OptionalUser) -> MeResponse:
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

    async with db.transaction():
        cur = await db.execute("insert into scratch_prd.users (is_guest) values (true) returning id")
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


def _verification_started(verification_token: str, email: str) -> VerificationStarted:
    return VerificationStarted(
        verification_id=verification_token,
        email=email,
        code_length=config.EMAIL_CODE_DIGITS,
        expires_in_seconds=int(config.EMAIL_CODE_TTL.total_seconds()),
    )


async def _send_code(
    pool: Pool, purpose: email_codes.Purpose, user_id: UUID, email: str, *, password_hash: str | None = None
) -> VerificationStarted:
    """確認コードを発行してメールで送る。メールの送信中は DB 接続を借りない"""
    async with pool.connection() as conn:
        issued = await email_codes.issue(conn, purpose, user_id, email, password_hash=password_hash)
    try:
        await email_codes.send(email, purpose, issued.code)
    except mailer.MailError as e:
        async with pool.connection() as conn:
            await email_codes.revoke(conn, issued.verification_token)
        raise HTTPException(status_code=503, detail={"code": "email_unavailable"}) from e
    return _verification_started(issued.verification_token, email)


async def _check_code(
    db: Conn, request: Request, purpose: email_codes.Purpose, verification_id: str, code: str
) -> email_codes.Verification:
    await enforce_rate_limit(
        db, "email_code_verify_ip", _client_ip_or_unknown(request), config.EMAIL_CODE_VERIFY_RATE_LIMIT_PER_IP
    )
    try:
        return await email_codes.check(db, purpose, verification_id, code)
    except email_codes.VerificationExpiredError as e:
        raise HTTPException(status_code=400, detail={"code": "verification_expired"}) from e
    except email_codes.InvalidCodeError as e:
        raise HTTPException(status_code=400, detail={"code": "invalid_code"}) from e


@router.post("/register", response_model_exclude_none=True)
async def register(body: RegisterRequest, request: Request, pool: Pool, user: CurrentUser) -> VerificationStarted:
    """登録の 1 段階目。メールアドレスに確認コードを送る（確認が済むまでゲストのまま）。
    パスワードは確認が済むまで Argon2id のハッシュで預かる。再送もこのエンドポイントを呼び直す"""
    if not user.is_guest:
        raise HTTPException(status_code=409, detail={"code": "already_registered"})
    async with pool.connection() as db:
        await enforce_rate_limit(db, "register_ip", _client_ip_or_unknown(request), config.REGISTER_RATE_LIMIT_PER_IP)
        if await accounts.email_taken(db, body.email):
            raise HTTPException(status_code=409, detail={"code": "email_taken"})
        await enforce_rate_limit(db, "email_code_send", body.email, config.EMAIL_CODE_SEND_RATE_LIMIT_PER_EMAIL)
    password_hash = passwords.hash_password(body.password)
    return await _send_code(pool, "register", user.user_id, body.email, password_hash=password_hash)


@router.post("/register/verify", response_model_exclude_none=True)
async def verify_register(
    body: RegisterVerifyRequest, request: Request, response: Response, db: Db, user: CurrentUser
) -> MeResponse:
    """登録の 2 段階目。コードが正しければ今のゲストを正規ユーザーにする（同じ users 行を昇格させる）"""
    if not user.is_guest:
        raise HTTPException(status_code=409, detail={"code": "already_registered"})
    verification = await _check_code(db, request, "register", body.verification_id, body.code)
    if verification.user_id != user.user_id or verification.password_hash is None:
        # 別のゲスト（別のブラウザ）で発行したコードは使えない
        raise HTTPException(status_code=400, detail={"code": "verification_expired"})

    try:
        async with db.transaction():
            await email_codes.consume(db, verification)
            await accounts.register_guest(db, user.user_id, verification.email, verification.password_hash)
            await start_session(db, request, response, user.user_id, previous=user)
    except email_codes.VerificationExpiredError as e:
        raise HTTPException(status_code=400, detail={"code": "verification_expired"}) from e
    except accounts.EmailTakenError as e:
        raise HTTPException(status_code=409, detail={"code": "email_taken"}) from e
    except accounts.AlreadyRegisteredError as e:
        raise HTTPException(status_code=409, detail={"code": "already_registered"}) from e

    await record_event(db, user.user_id, "signup_completed", {"method": "password"})
    return MeResponse(
        user=MeUser(
            id=user.user_id,
            is_guest=False,
            email=verification.email,
            display_name=user.display_name,
            onboarding_done=user.onboarding_done,
        )
    )


@router.post("/login", response_model_exclude_none=True)
async def login(body: LoginRequest, request: Request, pool: Pool) -> VerificationStarted:
    """ログインの 1 段階目。メールアドレス + パスワードが正しければ、確認コードをメールで送る。
    再送もこのエンドポイントを呼び直す"""
    async with pool.connection() as db:
        await enforce_rate_limit(db, "login_ip", _client_ip_or_unknown(request), config.LOGIN_RATE_LIMIT_PER_IP)
        await enforce_rate_limit(db, "login_email", body.email, config.LOGIN_RATE_LIMIT_PER_EMAIL)
        creds = await accounts.authenticate(db, body.email, body.password)
        if creds is None:
            raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})
        await enforce_rate_limit(db, "email_code_send", creds.email, config.EMAIL_CODE_SEND_RATE_LIMIT_PER_EMAIL)
    return await _send_code(pool, "login", creds.user_id, creds.email)


@router.post("/login/verify", response_model_exclude_none=True)
async def verify_login(
    body: LoginVerifyRequest, request: Request, response: Response, db: Db, current: OptionalUser
) -> MeResponse:
    """ログインの 2 段階目。コードが正しければログインする。
    今のセッションがデータのあるゲストなら、guestData（merge / discard）の指定が無い限り 409 guest_data_exists を返す
    （コードは使用済みにしないので、同じコードで選び直せる）。ゲストのデータがサンプルのままなら、確認せずに捨てる"""
    verification = await _check_code(db, request, "login", body.verification_id, body.code)
    creds = await accounts.find_credentials_by_id(db, verification.user_id)
    if creds is None:
        raise HTTPException(status_code=400, detail={"code": "verification_expired"})

    guest = current if current is not None and current.is_guest else None
    if guest is not None and body.guest_data is None:
        summary = await accounts.guest_data_summary(db, guest.user_id)
        if not summary.is_empty and not await accounts.guest_is_untouched(db, guest.user_id):
            raise HTTPException(
                status_code=409,
                detail={"code": "guest_data_exists", "projects": summary.projects, "notes": summary.notes},
            )

    try:
        async with db.transaction():
            await email_codes.consume(db, verification)
            if guest is not None:
                # ゲストのセッションはゲストの削除と一緒に消える
                await accounts.resolve_guest(db, guest.user_id, creds.user_id, body.guest_data or "discard")
                await start_session(db, request, response, creds.user_id, previous=None)
            else:
                await start_session(db, request, response, creds.user_id, previous=current)
            await db.execute("update scratch_prd.users set last_active_at = now() where id = %s", (creds.user_id,))
    except email_codes.VerificationExpiredError as e:
        raise HTTPException(status_code=400, detail={"code": "verification_expired"}) from e

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
