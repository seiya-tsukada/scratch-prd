"""メールアドレス + パスワードのアカウント操作（登録・ログイン・ゲストの統合・削除）"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from psycopg import errors as pg_errors

from backend.app import config
from backend.app.db import Conn
from backend.app.services import passwords
from backend.app.services.workspace_repo import LimitExceededError

PASSWORD_PROVIDER = "password"


class EmailTakenError(Exception):
    pass


class AlreadyRegisteredError(Exception):
    pass


@dataclass(frozen=True)
class GuestDataSummary:
    projects: int
    notes: int

    @property
    def is_empty(self) -> bool:
        return self.projects == 0


@dataclass(frozen=True)
class Credentials:
    user_id: UUID
    email: str
    display_name: str | None
    password_hash: str
    onboarding_done: bool


async def register_guest(conn: Conn, guest_id: UUID, email: str, password: str, display_name: str | None) -> None:
    """ゲストの users 行をそのまま正規ユーザーにする（データは移さない）。呼び出し側のトランザクション内で実行する"""
    cur = await conn.execute("select 1 from idea_ws.users where email = %s", (email,))
    if await cur.fetchone():
        raise EmailTakenError
    password_hash = passwords.hash_password(password)
    try:
        cur = await conn.execute(
            """
            update idea_ws.users
            set is_guest = false, email = %s, display_name = coalesce(%s, display_name), last_active_at = now()
            where id = %s and is_guest
            returning id
            """,
            (email, display_name, guest_id),
        )
        if await cur.fetchone() is None:
            raise AlreadyRegisteredError
        await conn.execute(
            "insert into idea_ws.user_identities (user_id, provider, provider_subject, email) values (%s, %s, %s, %s)",
            (guest_id, PASSWORD_PROVIDER, email, email),
        )
        await conn.execute(
            "insert into idea_ws.password_credentials (user_id, password_hash) values (%s, %s)",
            (guest_id, password_hash),
        )
    except pg_errors.UniqueViolation as e:
        # 同時に同じメールアドレスで登録された
        raise EmailTakenError from e


async def find_credentials(conn: Conn, email: str) -> Credentials | None:
    cur = await conn.execute(
        """
        select u.id as user_id, u.email::text as email, u.display_name, pc.password_hash,
               u.onboarding_completed_at is not null as onboarding_done
        from idea_ws.users u
        join idea_ws.password_credentials pc on pc.user_id = u.id
        where u.email = %s and not u.is_guest
        """,
        (email,),
    )
    row = await cur.fetchone()
    return Credentials(**row) if row else None


async def authenticate(conn: Conn, email: str, password: str) -> Credentials | None:
    """メールアドレスとパスワードを確かめる。どちらが誤りかは区別しない"""
    creds = await find_credentials(conn, email)
    if creds is None:
        passwords.verify_dummy(password)
        return None
    if not passwords.verify_password(creds.password_hash, password):
        return None
    if passwords.needs_rehash(creds.password_hash):
        await set_password(conn, creds.user_id, password)
    return creds


async def verify_user_password(conn: Conn, user_id: UUID, password: str) -> bool:
    cur = await conn.execute("select password_hash from idea_ws.password_credentials where user_id = %s", (user_id,))
    row = await cur.fetchone()
    if row is None:
        passwords.verify_dummy(password)
        return False
    return passwords.verify_password(row["password_hash"], password)


async def set_password(conn: Conn, user_id: UUID, password: str) -> None:
    await conn.execute(
        "update idea_ws.password_credentials set password_hash = %s where user_id = %s",
        (passwords.hash_password(password), user_id),
    )


async def guest_data_summary(conn: Conn, guest_id: UUID) -> GuestDataSummary:
    cur = await conn.execute(
        """
        select (select count(*) from idea_ws.projects where user_id = %s) as projects,
               (select count(*) from idea_ws.notes where user_id = %s) as notes
        """,
        (guest_id, guest_id),
    )
    row = await cur.fetchone()
    assert row is not None
    return GuestDataSummary(projects=int(row["projects"]), notes=int(row["notes"]))


async def resolve_guest(conn: Conn, guest_id: UUID, target_id: UUID, action: Literal["merge", "discard"]) -> None:
    """ログイン時に、ゲストのデータを target に統合する（merge）か捨てる（discard）。最後にゲストを削除する。
    呼び出し側のトランザクション内で実行する"""
    if action == "merge":
        summary = await guest_data_summary(conn, guest_id)
        cur = await conn.execute("select count(*) from idea_ws.projects where user_id = %s", (target_id,))
        row = await cur.fetchone()
        if row and int(row["count"]) + summary.projects > config.MAX_PROJECTS_PER_USER:
            raise LimitExceededError("projects", config.MAX_PROJECTS_PER_USER)
        # 配下のテーブルは複合外部キーの on update cascade で付け替わる
        await conn.execute("update idea_ws.projects set user_id = %s where user_id = %s", (target_id, guest_id))
        # ファネルを途切れさせないよう、計測データも引き継ぐ
        await conn.execute("update idea_ws.events set user_id = %s where user_id = %s", (target_id, guest_id))
        await conn.execute("update idea_ws.ai_generations set user_id = %s where user_id = %s", (target_id, guest_id))
    await conn.execute("delete from idea_ws.users where id = %s and is_guest", (guest_id,))


async def finish_onboarding(conn: Conn, user_id: UUID, result: str) -> bool:
    """初回の案内を終えた（completed / skipped）ことを記録する。既に記録済みなら何もせず False"""
    cur = await conn.execute(
        """
        update idea_ws.users set onboarding_completed_at = now(), onboarding_result = %s
        where id = %s and onboarding_completed_at is null
        returning id
        """,
        (result, user_id),
    )
    return await cur.fetchone() is not None


async def update_display_name(conn: Conn, user_id: UUID, display_name: str | None) -> None:
    await conn.execute("update idea_ws.users set display_name = %s where id = %s", (display_name, user_id))


async def revoke_other_sessions(conn: Conn, user_id: UUID, keep_session_id: UUID) -> None:
    await conn.execute(
        "update idea_ws.sessions set revoked_at = now() where user_id = %s and id <> %s and revoked_at is null",
        (user_id, keep_session_id),
    )


async def delete_user(conn: Conn, user_id: UUID) -> None:
    """users 行を消すと、ユーザー配下のデータはすべて cascade で消える（計測データは匿名化して残る）"""
    await conn.execute("delete from idea_ws.users where id = %s", (user_id,))
