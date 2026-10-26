"""トークン・IP のハッシュ化、セッション Cookie、Origin 検証（CSRF 対策）"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import HTTPException, Request, Response

from backend.app import config

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _hmac(purpose: str, value: str) -> bytes:
    pepper = config.get_settings().session_token_pepper.get_secret_value()
    return hmac.new(pepper.encode(), f"{purpose}:{value}".encode(), hashlib.sha256).digest()


def hash_token(token: str) -> bytes:
    """セッション・ログイン用トークンの保存形式。平文は DB に保存しない"""
    return _hmac("token", token)


def hash_ip(ip: str) -> bytes:
    """IP アドレスの保存・レート制限キー用。生の IP は保存しない"""
    return _hmac("ip", ip)


def client_ip(request: Request) -> str | None:
    if config.get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def session_cookie_name() -> str:
    secure = config.get_settings().cookie_secure
    return config.SECURE_SESSION_COOKIE_NAME if secure else config.SESSION_COOKIE_NAME


def set_session_cookie(response: Response, token: str, ttl: timedelta) -> None:
    response.set_cookie(
        session_cookie_name(),
        token,
        max_age=int(ttl.total_seconds()),
        path="/",
        httponly=True,
        secure=config.get_settings().cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        session_cookie_name(),
        path="/",
        httponly=True,
        secure=config.get_settings().cookie_secure,
        samesite="lax",
    )


async def verify_origin(request: Request) -> None:
    """状態を変えるリクエストは、許可された Origin からのものだけ受け付ける"""
    if request.method not in UNSAFE_METHODS:
        return
    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin not in config.get_settings().allowed_origin_list:
        raise HTTPException(status_code=403, detail={"code": "invalid_origin"})
