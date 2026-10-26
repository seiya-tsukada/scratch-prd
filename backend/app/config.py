"""環境変数とアプリ全体の定数"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

# .env.example に記載しているプレースホルダー。この値のままなら未設定とみなす
GEMINI_API_KEY_PLACEHOLDER = "MY_GEMINI_API_KEY"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"

    @property
    def effective_gemini_api_key(self) -> str | None:
        key = self.gemini_api_key
        return key if key and key != GEMINI_API_KEY_PLACEHOLDER else None


@lru_cache
def get_settings() -> Settings:
    return Settings()


GEMINI_TEMPERATURE = 0.2
GEMINI_TIMEOUT_SECONDS = 60

# AI への入力上限。src/config/api.ts の AI_INPUT_LIMITS と同じ値にすること（test_limits_sync.py で検証）
MAX_NOTES = 50
MAX_NOTE_CONTENT_CHARS = 20_000
MAX_TOTAL_NOTE_CHARS = 100_000
MAX_ROUGH_NOTE_CHARS = 20_000
MAX_TITLE_CHARS = 200
MAX_EXISTING_PRD_CHARS = 50_000

# これを超える Content-Length のリクエストは 413
MAX_REQUEST_BYTES = 1_000_000

# PRD 再生成時にプロンプトへ含める既存PRDの最大文字数
EXISTING_PRD_CONTEXT_MAX_CHARS = 1000

# フォールバック PRD で各メモから抜き出す本文の最大文字数
MOCK_FACT_MAX_CHARS = 100

DEFAULT_PROJECT_NAME = "Idea Workspace"

# 以下は src/config の値と揃える
UNTITLED_NOTE_LABEL = "無題のメモ"
DISPLAY_TIMEZONE = ZoneInfo("Asia/Tokyo")
