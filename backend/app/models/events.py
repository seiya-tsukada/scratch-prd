"""計測イベントの受信"""

from __future__ import annotations

from typing import Any

from pydantic import Field, model_validator

from backend.app.models.ai import CamelModel
from backend.app.services.events import CLIENT_EVENTS, validate_properties


class ClientEvent(CamelModel):
    name: str = Field(max_length=64)
    properties: dict[str, Any] = Field(default={}, max_length=10)

    @model_validator(mode="after")
    def allowed(self) -> ClientEvent:
        if self.name not in CLIENT_EVENTS:
            raise ValueError(f"Event is not accepted from clients: {self.name}")
        validate_properties(self.name, self.properties)
        return self
