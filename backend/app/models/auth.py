"""認証エンドポイントの入出力"""

from __future__ import annotations

from uuid import UUID

from pydantic import Field

from backend.app.models.ai import CamelModel


class GuestRequest(CamelModel):
    turnstile_token: str = Field(min_length=1, max_length=2048)


class MeUser(CamelModel):
    id: UUID
    is_guest: bool
    email: str | None = None
    display_name: str | None = None


class MeResponse(CamelModel):
    user: MeUser
