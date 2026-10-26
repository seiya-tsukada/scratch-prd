"""Gemini 呼び出し。responseSchema による構造化出力を使い、ルーターには検証済みの pydantic モデルを返す"""

from __future__ import annotations

import asyncio
import re
from functools import lru_cache
from typing import Any, Protocol

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from backend.app import config

_JSON_OBJECT = re.compile(r"\{[\s\S]*\}")


class GeminiClient(Protocol):
    @property
    def model(self) -> str: ...

    async def generate[T: BaseModel](self, prompt: str, schema: type[T]) -> T | None:
        """schema に沿った応答を返す。応答が schema に合わなければ None。通信エラー・タイムアウトは例外"""
        ...


def parse_structured[T: BaseModel](parsed: Any, text: str | None, schema: type[T]) -> T | None:
    """SDK が検証済みの parsed を返していればそれを使い、無ければ本文を JSON として検証する。
    本文の前後に余計な文字がある場合に限り、最初の {...} を抜き出して再検証する（最終手段）"""
    if isinstance(parsed, schema):
        return parsed
    if not text:
        return None
    try:
        return schema.model_validate_json(text)
    except ValidationError:
        pass
    match = _JSON_OBJECT.search(text)
    if not match:
        return None
    try:
        return schema.model_validate_json(match.group(0))
    except ValidationError:
        return None


class GoogleGeminiClient:
    def __init__(self, api_key: str, model: str) -> None:
        self._model = model
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=config.GEMINI_TIMEOUT_SECONDS * 1000),
        )

    @property
    def model(self) -> str:
        return self._model

    async def generate[T: BaseModel](self, prompt: str, schema: type[T]) -> T | None:
        # SDK の再試行を含めても全体で上限時間を超えないようにする
        async with asyncio.timeout(config.GEMINI_TIMEOUT_SECONDS):
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=config.GEMINI_TEMPERATURE,
                ),
            )
        return parse_structured(response.parsed, response.text, schema)


@lru_cache
def _client_for(api_key: str, model: str) -> GoogleGeminiClient:
    return GoogleGeminiClient(api_key, model)


def get_gemini_client() -> GeminiClient | None:
    """API キーが設定されていれば Gemini クライアントを返す（FastAPI の依存関数）"""
    settings = config.get_settings()
    api_key = settings.effective_gemini_api_key
    return _client_for(api_key, settings.gemini_model) if api_key else None
