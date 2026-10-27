"""セッションの発行・検証・失効と、現在のユーザーを取得する FastAPI の依存関数"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response

from backend.app import config, security
from backend.app.db import Conn, Pool


@dataclass(frozen=True)
class SessionUser:
    session_id: UUID
    user_id: UUID
    is_guest: bool
    email: str | None
    display_name: str | None
    onboarding_done: bool = False

    @property
    def account_type(self) -> str:
        """config.SESSION_TTL / AI_DAILY_QUOTAS のキー"""
        return "guest" if self.is_guest else "registered"


def session_ttl(is_guest: bool) -> timedelta:
    return config.SESSION_TTL["guest" if is_guest else "registered"]


async def create_session(conn: Conn, user_id: UUID, *, is_guest: bool, request: Request) -> str:
    """セッションを作り、Cookie に入れる平文トークンを返す（DB にはハッシュのみ保存）"""
    token = security.new_token()
    ip = security.client_ip(request)
    user_agent = (request.headers.get("user-agent") or "")[: config.USER_AGENT_MAX_CHARS] or None
    await conn.execute(
        """
        insert into idea_ws.sessions (user_id, token_hash, expires_at, user_agent, ip_hash)
        values (%s, %s, now() + %s, %s, %s)
        """,
        (user_id, security.hash_token(token), session_ttl(is_guest), user_agent, security.hash_ip(ip) if ip else None),
    )
    return token


async def find_session(conn: Conn, request: Request, response: Response) -> SessionUser | None:
    """Cookie のトークンから有効なセッションを探す。一定間隔ごとに最終アクセスと有効期限を延長する"""
    token = request.cookies.get(security.session_cookie_name())
    if not token:
        return None

    cur = await conn.execute(
        """
        select s.id as session_id, u.id as user_id, u.is_guest, u.email::text as email, u.display_name,
               u.onboarding_completed_at is not null as onboarding_done
        from idea_ws.sessions s
        join idea_ws.users u on u.id = s.user_id
        where s.token_hash = %s and s.revoked_at is null and s.expires_at > now()
        """,
        (security.hash_token(token),),
    )
    row = await cur.fetchone()
    if row is None:
        return None
    user = SessionUser(**row)

    ttl = session_ttl(user.is_guest)
    cur = await conn.execute(
        """
        update idea_ws.sessions
        set last_seen_at = now(), expires_at = now() + %s
        where id = %s and last_seen_at < now() - %s
        returning id
        """,
        (ttl, user.session_id, config.SESSION_TOUCH_INTERVAL),
    )
    if await cur.fetchone():
        await conn.execute("update idea_ws.users set last_active_at = now() where id = %s", (user.user_id,))
        security.set_session_cookie(response, token, ttl)
    return user


async def revoke_session(conn: Conn, session_id: UUID) -> None:
    await conn.execute(
        "update idea_ws.sessions set revoked_at = now() where id = %s and revoked_at is null", (session_id,)
    )


async def optional_user(pool: Pool, request: Request, response: Response) -> SessionUser | None:
    async with pool.connection() as conn:
        return await find_session(conn, request, response)


async def require_user(user: Annotated[SessionUser | None, Depends(optional_user)]) -> SessionUser:
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated"})
    return user


OptionalUser = Annotated[SessionUser | None, Depends(optional_user)]
CurrentUser = Annotated[SessionUser, Depends(require_user)]
