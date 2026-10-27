"""認証エンドポイントの入出力"""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from backend.app import config
from backend.app.models.ai import CamelModel
from backend.app.services.passwords import password_problem

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    """前後の空白を除き小文字にする（DB の比較も大文字小文字を区別しない）"""
    value = value.strip().lower()
    if len(value) > config.MAX_EMAIL_CHARS or not _EMAIL.match(value):
        raise ValueError("Invalid email address")
    return value


def checked_password(value: str) -> str:
    problem = password_problem(value)
    if problem:
        raise ValueError(problem)
    return value


def display_name_or_none(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


class GuestRequest(CamelModel):
    turnstile_token: str = Field(min_length=1, max_length=2048)


class RegisterRequest(CamelModel):
    """今のゲストをメールアドレス + パスワードの正規ユーザーにする"""

    email: str = Field(max_length=config.MAX_EMAIL_CHARS + 20)
    password: str = Field(max_length=config.MAX_PASSWORD_CHARS + 1)
    display_name: str | None = Field(default=None, max_length=config.MAX_DISPLAY_NAME_CHARS)

    _email = field_validator("email")(normalize_email)
    _password = field_validator("password")(checked_password)
    _display_name = field_validator("display_name")(display_name_or_none)


class LoginRequest(CamelModel):
    """guest_data: 今のゲストにデータがあるとき、統合する（merge）か破棄する（discard）か"""

    email: str = Field(max_length=config.MAX_EMAIL_CHARS + 20)
    password: str = Field(min_length=1, max_length=config.MAX_PASSWORD_CHARS)
    guest_data: Literal["merge", "discard"] | None = None

    _email = field_validator("email")(normalize_email)


class AccountUpdate(CamelModel):
    display_name: str | None = Field(default=None, max_length=config.MAX_DISPLAY_NAME_CHARS)

    _display_name = field_validator("display_name")(display_name_or_none)


class PasswordChange(CamelModel):
    current_password: str = Field(min_length=1, max_length=config.MAX_PASSWORD_CHARS)
    new_password: str = Field(max_length=config.MAX_PASSWORD_CHARS + 1)

    _new_password = field_validator("new_password")(checked_password)


class OnboardingResult(CamelModel):
    result: Literal["completed", "skipped"]


class AccountDelete(CamelModel):
    """正規ユーザーはパスワードの再入力が必須。ゲストは不要"""

    password: str | None = Field(default=None, max_length=config.MAX_PASSWORD_CHARS)


class MeUser(CamelModel):
    id: UUID
    is_guest: bool
    email: str | None = None
    display_name: str | None = None
    onboarding_done: bool = False


class MeResponse(CamelModel):
    user: MeUser
