"""メールの確認コード（登録・ログインの 2 段階目）。

1 段階目（メールアドレス + パスワード）が通ったら、確認 ID（乱数。画面にだけ渡す）とコードを発行してメールで送る。
2 段階目で確認 ID とコードの組を確かめる。どちらも DB にはハッシュでのみ保存する"""

from __future__ import annotations

import hmac
import html
import secrets
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from backend.app import config, security
from backend.app.db import Conn
from backend.app.services import mailer

Purpose = Literal["register", "login"]


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


@dataclass(frozen=True)
class _MailCopy:
    greeting: str  # {name} {app} を埋める
    instruction: str  # {screen} {minutes} を埋める
    screen: str
    ignore: str


MAIL_COPIES: dict[Purpose, _MailCopy] = {
    "register": _MailCopy(
        greeting="{name} さん、{app} へのご登録ありがとうございます。",
        instruction="{screen}に次の確認コードを入力してください。コードの有効期限は{minutes}分です。",
        screen="登録画面",
        ignore="心当たりがない場合は、このメールを破棄してください。アカウントは有効になりません。",
    ),
    "login": _MailCopy(
        greeting="{name} さん、{app} へのログインを受け付けました。",
        instruction="{screen}に次の確認コードを入力してください。コードの有効期限は{minutes}分です。",
        screen="ログイン画面",
        ignore="心当たりがない場合は、このメールを破棄してください。第三者にコードを伝えないでください。",
    ),
}


def build_mail(to: str, purpose: Purpose, code: str) -> tuple[str, str, str]:
    """件名・テキスト本文・HTML 本文を返す。宛名はメールアドレスの @ より前"""
    copy = MAIL_COPIES[purpose]
    app = config.APP_NAME
    minutes = int(config.EMAIL_CODE_TTL.total_seconds() // 60)
    greeting = copy.greeting.format(name=to.split("@", 1)[0], app=app)
    instruction = copy.instruction.format(screen=copy.screen, minutes=minutes)
    footer = f"このメールは {app} から自動送信されています。"

    subject = f"【{app}】確認コード: {code}"
    # コードは単独の行に置く（テストの last_code もこの形で取り出す）
    text = f"{app}\n\n確認コード\n\n{greeting}\n\n{instruction}\n\n    {code}\n\n{copy.ignore}\n\n{footer}\n"

    e = html.escape
    font = "-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif"
    p = "margin:0 0 20px;font-size:15px;line-height:1.7;color:#1f1f1f"
    code_box = (
        "display:inline-block;padding:18px 32px;background:#f3f3f3;border-radius:8px;"
        "font-family:Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1f1f1f"
    )
    html_body = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:{font}">
<tr><td style="padding:0 0 32px;font-size:18px;font-weight:700;color:#1f1f1f">{e(app)}</td></tr>
<tr><td style="padding:0 0 20px;font-size:22px;font-weight:700;color:#1f1f1f">確認コード</td></tr>
<tr><td><p style="{p}">{e(greeting)}</p><p style="{p}">{e(instruction)}</p></td></tr>
<tr><td style="padding:4px 0 28px">
<div style="{code_box}">{e(code)}</div>
</td></tr>
<tr><td><p style="{p}">{e(copy.ignore)}</p></td></tr>
<tr><td style="padding:16px 0 0;font-size:13px;color:#777777">{e(footer)}</td></tr>
</table>
</td></tr>
</table>
</body></html>
"""
    return subject, text, html_body


async def send(to: str, purpose: Purpose, code: str) -> None:
    subject, text, html_body = build_mail(to, purpose, code)
    await mailer.send_email(to, subject, text, html_body)


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
