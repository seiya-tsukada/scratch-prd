"""メールの確認コード（登録・ログインの 2 段階目）。

1 段階目（メールアドレス + パスワード）が通ったら、確認 ID（乱数。画面にだけ渡す）とコードを発行してメールで送る。
2 段階目で確認 ID とコードの組を確かめる。どちらも DB にはハッシュでのみ保存する"""

from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from backend.app import config, security
from backend.app.db import Conn
from backend.app.services import mailer

Purpose = Literal["register", "login"]

PURPOSE_LABELS: dict[Purpose, str] = {"register": "アカウント登録", "login": "ログイン"}


class VerificationExpiredError(Exception):
    """確認 ID が無い・期限切れ・使用済み・入力回数の上限"""


class InvalidCodeError(Exception):
    pass


@dataclass(frozen=True)
class Verification:
    id: UUID
    user_id: UUID
    email: str
    password_hash: str | None


@dataclass(frozen=True)
class IssuedCode:
    verification_token: str
    code: str


def new_code() -> str:
    return f"{secrets.randbelow(10**config.EMAIL_CODE_DIGITS):0{config.EMAIL_CODE_DIGITS}d}"


async def issue(
    conn: Conn, purpose: Purpose, user_id: UUID, email: str, *, password_hash: str | None = None
) -> IssuedCode:
    """新しいコードを発行する。同じユーザー・用途の未使用のコードは無効にする（再送したら古いコードは使えない）"""
    token = security.new_token()
    code = new_code()
    async with conn.transaction():
        await conn.execute(
            "delete from scratch_prd.email_verification_codes where user_id = %s and purpose = %s and used_at is null",
            (user_id, purpose),
        )
        await conn.execute(
            """
            insert into scratch_prd.email_verification_codes
              (purpose, user_id, email, token_hash, code_hash, password_hash, expires_at)
            values (%s, %s, %s, %s, %s, %s, now() + %s)
            """,
            (
                purpose,
                user_id,
                email,
                security.hash_token(token),
                security.hash_email_code(token, code),
                password_hash,
                config.EMAIL_CODE_TTL,
            ),
        )
    return IssuedCode(verification_token=token, code=code)


async def revoke(conn: Conn, verification_token: str) -> None:
    """送信に失敗したコードを消す"""
    await conn.execute(
        "delete from scratch_prd.email_verification_codes where token_hash = %s",
        (security.hash_token(verification_token),),
    )


async def send(to: str, purpose: Purpose, code: str) -> None:
    minutes = int(config.EMAIL_CODE_TTL.total_seconds() // 60)
    label = PURPOSE_LABELS[purpose]
    subject = f"{config.APP_NAME} の確認コード"
    text = (
        f"{config.APP_NAME} の{label}の確認コードです。\n\n"
        f"    {code}\n\n"
        f"画面に戻って、このコードを入力してください。有効期限は{minutes}分です。\n"
        "心当たりがない場合は、このメールを破棄してください。第三者にコードを伝えないでください。\n"
    )
    await mailer.send_email(to, subject, text)


async def check(conn: Conn, purpose: Purpose, verification_token: str, code: str) -> Verification:
    """確認 ID とコードを確かめる（まだ使用済みにはしない。成功後の処理と一緒に consume する）。
    入力回数は正誤にかかわらず数える（同時に送られても上限を超えないよう、更新で数える）"""
    cur = await conn.execute(
        """
        update scratch_prd.email_verification_codes
        set attempts = attempts + 1
        where token_hash = %s and purpose = %s and used_at is null and expires_at > now() and attempts < %s
        returning id, user_id, email::text as email, code_hash, password_hash
        """,
        (security.hash_token(verification_token), purpose, config.EMAIL_CODE_MAX_ATTEMPTS),
    )
    row = await cur.fetchone()
    if row is None:
        raise VerificationExpiredError
    expected = bytes(row["code_hash"])
    if not hmac.compare_digest(expected, security.hash_email_code(verification_token, code)):
        raise InvalidCodeError
    return Verification(
        id=UUID(str(row["id"])),
        user_id=UUID(str(row["user_id"])),
        email=row["email"],
        password_hash=row["password_hash"],
    )


async def consume(conn: Conn, verification: Verification) -> None:
    """コードを使用済みにする。同時に使われていたら VerificationExpiredError。
    呼び出し側のトランザクション内で実行する"""
    cur = await conn.execute(
        "update scratch_prd.email_verification_codes set used_at = now() where id = %s and used_at is null "
        "returning id",
        (verification.id,),
    )
    if await cur.fetchone() is None:
        raise VerificationExpiredError


async def cleanup(conn: Conn) -> int:
    cur = await conn.execute(
        "delete from scratch_prd.email_verification_codes where expires_at <= now() or used_at is not null"
    )
    return cur.rowcount
