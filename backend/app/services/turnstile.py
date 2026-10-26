"""Cloudflare Turnstile のサーバー側検証。検証できない場合は常に失敗扱い（fail closed）"""

from __future__ import annotations

import logging
from typing import Protocol
from uuid import uuid4

import httpx

from backend.app import config

logger = logging.getLogger(__name__)


class TurnstileVerifier(Protocol):
    async def verify(self, token: str, remote_ip: str | None) -> bool: ...


class CloudflareTurnstileVerifier:
    def __init__(self, secret_key: str) -> None:
        self._secret_key = secret_key

    async def verify(self, token: str, remote_ip: str | None) -> bool:
        data = {"secret": self._secret_key, "response": token, "idempotency_key": str(uuid4())}
        if remote_ip:
            data["remoteip"] = remote_ip
        try:
            async with httpx.AsyncClient(timeout=config.TURNSTILE_TIMEOUT_SECONDS) as client:
                response = await client.post(config.TURNSTILE_VERIFY_URL, data=data)
                response.raise_for_status()
                result = response.json()
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("turnstile: verification request failed (%s)", type(e).__name__)
            return False
        if not result.get("success"):
            logger.info("turnstile: rejected (%s)", result.get("error-codes"))
            return False
        return True


class MisconfiguredTurnstileVerifier:
    async def verify(self, token: str, remote_ip: str | None) -> bool:
        logger.error("turnstile: TURNSTILE_SECRET_KEY is not set")
        return False


def get_turnstile_verifier() -> TurnstileVerifier:
    secret = config.get_settings().turnstile_secret_key
    return CloudflareTurnstileVerifier(secret.get_secret_value()) if secret else MisconfiguredTurnstileVerifier()
