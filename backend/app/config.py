"""環境変数とアプリ全体の定数"""

from __future__ import annotations

from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

# .env.example に記載しているプレースホルダー。この値のままなら未設定とみなす
GEMINI_API_KEY_PLACEHOLDER = "MY_GEMINI_API_KEY"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"

    # バックエンドの DB 接続（本番は Supavisor の transaction pooler、ユーザーは idea_ws_app）
    database_url: str = "postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres"
    # セッショントークン・IP をハッシュ化する HMAC の鍵。必須
    session_token_pepper: SecretStr
    # 状態を変えるリクエストで許可する Origin（カンマ区切り）
    allowed_origins: str = "http://localhost:3000"
    turnstile_secret_key: SecretStr | None = None
    # ローカル（http）では false にする。true なら Cookie 名に __Host- を付ける
    cookie_secure: bool = True
    # Vercel 上では true（x-forwarded-for を Vercel が上書きするため信頼できる）
    trust_proxy_headers: bool = False
    # Vercel Cron が Authorization: Bearer で送る秘密（16 文字以上のランダム文字列）
    cron_secret: SecretStr | None = None

    @property
    def effective_gemini_api_key(self) -> str | None:
        key = self.gemini_api_key
        return key if key and key != GEMINI_API_KEY_PLACEHOLDER else None

    @property
    def allowed_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # 必須項目は環境変数・.env から読む


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
# 旧 localStorage データの取り込み（プロジェクト単位）だけは大きくする（Vercel の上限 4.5MB 未満）
IMPORT_MAX_REQUEST_BYTES = 4_000_000
IMPORT_PATH = "/api/import/local-project"

# 保存できるデータの上限（ゲストによる DB の使いすぎを防ぐ。AI の入力上限とは別）
MAX_PROJECTS_PER_USER = 100
MAX_SECTIONS_PER_PROJECT = 50
MAX_NOTES_PER_PROJECT = 2_000
MAX_PRDS_PER_PROJECT = 200
MAX_PRD_VERSIONS_PER_PRD = 200
MAX_NAME_CHARS = 200
MAX_DESCRIPTION_CHARS = 2_000
MAX_STORED_NOTE_CHARS = 100_000
MAX_STORED_PRD_CHARS = 200_000
MAX_PRD_ITEMS = 500
MAX_PRD_SOURCE_NOTES = 200

# ワークスペースのペイン（src/config/app.ts と同じ）
MAX_PANES = 4
DEFAULT_PANE_COUNT = 2
PANE_IDS = [f"pane-{i}" for i in range(MAX_PANES)]
# ユーザーが追加したセクションのアイコン（src/config/seed.ts の CUSTOM_SECTION_ICON）
CUSTOM_SECTION_ICON = "Folder"

# セッション（アクセスのたびに延長する）。ゲストは Cookie を失うとデータに戻れないため長くする
SESSION_TTL = {"guest": timedelta(days=180), "registered": timedelta(days=30)}
# last_seen_at / 有効期限の更新間隔（毎リクエストで書き込まないため）
SESSION_TOUCH_INTERVAL = timedelta(minutes=10)
SESSION_COOKIE_NAME = "iws_session"
SECURE_SESSION_COOKIE_NAME = "__Host-iws_session"

# AI の日次利用上限（日付は JST）
AiKind = Literal["structure", "prd"]
AI_DAILY_QUOTAS: dict[str, dict[AiKind, int]] = {
    "guest": {"structure": 20, "prd": 5},
    "registered": {"structure": 100, "prd": 30},
}

# ゲスト作成の IP 単位レート制限
GUEST_CREATE_RATE_LIMIT = 10
GUEST_CREATE_RATE_WINDOW_SECONDS = 3600

# メールアドレス + パスワードのログイン（メールアドレスの確認は行わない）
MAX_EMAIL_CHARS = 254
MIN_PASSWORD_CHARS = 10
MAX_PASSWORD_CHARS = 128
MAX_DISPLAY_NAME_CHARS = 100
# 総当たり対策（回数, 秒）。キーは IP / メールアドレスの HMAC
LOGIN_RATE_LIMIT_PER_IP = (10, 15 * 60)
LOGIN_RATE_LIMIT_PER_EMAIL = (5, 15 * 60)
REGISTER_RATE_LIMIT_PER_IP = (5, 60 * 60)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_SECONDS = 10

USER_AGENT_MAX_CHARS = 500

# PRD 再生成時にプロンプトへ含める既存PRDの最大文字数
EXISTING_PRD_CONTEXT_MAX_CHARS = 1000

# フォールバック PRD で各メモから抜き出す本文の最大文字数
MOCK_FACT_MAX_CHARS = 100

DEFAULT_PROJECT_NAME = "Idea Workspace"

# 以下は src/config の値と揃える
UNTITLED_NOTE_LABEL = "無題のメモ"
DISPLAY_TIMEZONE = ZoneInfo("Asia/Tokyo")
