"""メール送信（Resend）。

ローカル（VERCEL_ENV 未設定）では送信せず、内容をログに出すだけにする（API キーが設定されていても送らない）。
プレビュー・本番では RESEND_API_KEY と MAIL_FROM が必須。未設定・送信失敗は MailError"""

from __future__ import annotations

import logging
import uuid

import httpx

from backend.app import config

logger = logging.getLogger(__name__)


class MailError(Exception):
    pass


async def send_email(to: str, subject: str, text: str) -> None:
    settings = config.get_settings()
    if settings.vercel_env is None:
        logger.warning("[mail] ローカルのため送信しません\nTo: %s\nSubject: %s\n\n%s", to, subject, text)
        return

    api_key = settings.effective_resend_api_key
    if api_key is None:
        logger.error("[mail] RESEND_API_KEY が未設定のため送信できません")
        raise MailError("RESEND_API_KEY is not set")
    mail_from = settings.effective_mail_from
    if mail_from is None:
        logger.error("[mail] MAIL_FROM が未設定のため送信できません")
        raise MailError("MAIL_FROM is not set")

    try:
        async with httpx.AsyncClient(timeout=config.MAIL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                config.RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    # タイムアウト後の再試行で二重に送らないよう、送信 1 回ごとに一意にする
                    "Idempotency-Key": str(uuid.uuid4()),
                },
                json={"from": mail_from, "to": [to], "subject": subject, "text": text},
            )
    except httpx.HTTPError as e:
        logger.error("[mail] Resend への接続に失敗しました: %s", type(e).__name__)
        raise MailError("request failed") from e

    if response.status_code >= 300:
        # 応答には宛先や本文は含まれない（エラーの種類とメッセージのみ）
        logger.error("[mail] Resend がエラーを返しました: status=%s body=%s", response.status_code, response.text[:500])
        raise MailError(f"status {response.status_code}")
