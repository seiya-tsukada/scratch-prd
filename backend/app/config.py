"""環境変数とアプリ全体の定数"""

from __future__ import annotations

from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]

# .env.example に記載しているプレースホルダー。この値のままなら未設定とみなす
GEMINI_API_KEY_PLACEHOLDER = "MY_GEMINI_API_KEY"

# 本番（VERCEL_ENV=production）で使ってはいけないローカル用の値
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "db", "db-test"}
# Cloudflare Turnstile のテスト用秘密鍵は 1x / 2x / 3x + 0 の並び + AA
TURNSTILE_TEST_SECRET_PREFIXES = (
    "1x0000000000000000000000000000000",
    "2x0000000000000000000000000000000",
    "3x0000000000000000000000000000000",
)
MIN_PRODUCTION_SECRET_CHARS = 32
# DATABASE_URL が未設定のときのローカル（docker compose の db）の接続先
LOCAL_DATABASE_URL = "postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"

    # バックエンドの DB 接続（本番は Supabase の Connect 画面の transaction pooler の文字列をそのまま使う。
    # ユーザーは postgres.<project-ref>。ローカルは idea_ws_app）。
    # 未設定ならローカルでは LOCAL_DATABASE_URL、Vercel 上ではモック（use_mock）になる
    database_url: str | None = None
    # セッショントークン・IP をハッシュ化する HMAC の鍵。DB を使うときは必須（モックでは使わない）
    session_token_pepper: SecretStr | None = None
    # 状態を変えるリクエストで許可する Origin（カンマ区切り）
    allowed_origins: str = "http://localhost:3000"
    turnstile_secret_key: SecretStr | None = None
    # ローカル（http）では false にする。true なら Cookie 名に __Host- を付ける
    cookie_secure: bool = True
    # Vercel 上では true（x-forwarded-for を Vercel が上書きするため信頼できる）
    trust_proxy_headers: bool = False
    # Vercel Cron が Authorization: Bearer で送る秘密（16 文字以上のランダム文字列）
    cron_secret: SecretStr | None = None
    # Vercel が自動で設定するシステム環境変数（ドメインのみ、https:// なし）。プレビューの URL は毎回変わるため、
    # このデプロイ自身の URL を許可する Origin に自動で加える
    vercel_url: str | None = None
    vercel_branch_url: str | None = None
    vercel_project_production_url: str | None = None
    # Vercel が自動で設定する（production / preview / development）。ローカルでは未設定
    vercel_env: str | None = None
    # DB に接続せず固定のサンプルを返す（backend/app/mock）。Supabase を用意するまでの一時的な設定。
    # 未設定なら自動: Vercel 上（VERCEL_ENV あり）で DATABASE_URL が無ければモック。false で自動切り替えを止める
    mock_backend: bool | None = None

    @property
    def use_mock(self) -> bool:
        """環境変数を何も設定せずに Vercel へデプロイしても動くよう、DB の設定が無ければモックで応答する"""
        if self.mock_backend is not None:
            return self.mock_backend
        return self.vercel_env is not None and not self.database_url

    @property
    def effective_database_url(self) -> str:
        return self.database_url or LOCAL_DATABASE_URL

    @property
    def pepper(self) -> str:
        if self.session_token_pepper is None:
            raise RuntimeError("SESSION_TOKEN_PEPPER が設定されていません")
        return self.session_token_pepper.get_secret_value()

    @model_validator(mode="after")
    def require_pepper_unless_mock(self) -> Self:
        if not self.use_mock and not self.session_token_pepper:
            raise ValueError("SESSION_TOKEN_PEPPER を設定してください")
        return self

    @model_validator(mode="after")
    def reject_local_settings_in_production(self) -> Self:
        """本番でローカル用の値のまま起動しない（設定漏れを起動時に検出する）。
        モックは DB・Turnstile・Cron を使わないため検査しない"""
        if self.vercel_env != "production" or self.use_mock:
            return self
        problems: list[str] = []
        if urlparse(self.effective_database_url).hostname in LOCAL_DB_HOSTS:
            problems.append("DATABASE_URL がローカルの DB を指しています")
        if len(self.pepper) < MIN_PRODUCTION_SECRET_CHARS:
            problems.append(f"SESSION_TOKEN_PEPPER は {MIN_PRODUCTION_SECRET_CHARS} 文字以上にしてください")
        turnstile = self.turnstile_secret_key.get_secret_value() if self.turnstile_secret_key else ""
        if not turnstile or turnstile.startswith(TURNSTILE_TEST_SECRET_PREFIXES):
            problems.append("TURNSTILE_SECRET_KEY が未設定、またはテスト用の値です")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE は true にしてください")
        if not self.trust_proxy_headers:
            problems.append("TRUST_PROXY_HEADERS は true にしてください")
        if not self.cron_secret or len(self.cron_secret.get_secret_value()) < 16:
            problems.append("CRON_SECRET を 16 文字以上で設定してください")
        if problems:
            raise ValueError("本番環境の設定に問題があります: " + " / ".join(problems))
        return self

    @property
    def effective_gemini_api_key(self) -> str | None:
        key = self.gemini_api_key
        return key if key and key != GEMINI_API_KEY_PLACEHOLDER else None

    @property
    def allowed_origin_list(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]
        for host in (self.vercel_url, self.vercel_branch_url, self.vercel_project_production_url):
            if host:
                origins.append(f"https://{host}")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()


GEMINI_TEMPERATURE = 0.2
GEMINI_TIMEOUT_SECONDS = 60

# AI への入力上限。src/config/api.ts の AI_INPUT_LIMITS と同じ値にすること（test_limits_sync.py で検証）
MAX_NOTES = 50
MAX_NOTE_CONTENT_CHARS = 20_000
MAX_TOTAL_NOTE_CHARS = 100_000
MAX_TITLE_CHARS = 200
# 再生成時に渡す前回の PRD の要約（見出し・事実・未決事項・決定事項）の件数と 1 件あたりの文字数
MAX_PREVIOUS_ITEMS = 100
MAX_PREVIOUS_ITEM_CHARS = 1_000

# これを超える Content-Length のリクエストは 413
MAX_REQUEST_BYTES = 1_000_000
# 旧 localStorage データの取り込み（プロジェクト単位）だけは大きくする（Vercel の上限 4.5MB 未満）
IMPORT_MAX_REQUEST_BYTES = 4_000_000
IMPORT_PATH = "/api/import/local-project"

# 保存できるデータの上限（ゲストによる DB の使いすぎを防ぐ。AI の入力上限とは別）
MAX_PROJECTS_PER_USER = 100
MAX_NOTES_PER_PROJECT = 2_000
# 旧 localStorage データの取り込みで受け付けるセクション数（PRD セクションの判定にだけ使う）
MAX_LEGACY_SECTIONS = 50
# 名前がこれに一致するセクションのメモは PRD として扱う（旧データの変換。マイグレーションと同じ規則）
LEGACY_PRD_SECTION_PATTERN = r"^\s*PRD"
MAX_PRDS_PER_PROJECT = 200
# メモのタグ（src/config/tags.ts と同じ値。backend/tests/test_limits_sync.py で検証）
MAX_TAGS_PER_PROJECT = 200
MAX_TAGS_PER_NOTE = 20
MAX_TAG_NAME_CHARS = 50
# タグの色はパレットのキーで保存する（Tailwind のクラスは画面側の src/config/tags.ts で対応付ける）
TAG_COLORS = ("gray", "red", "amber", "green", "teal", "blue", "indigo", "purple", "pink")
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

# セッション（アクセスのたびに延長する）。ゲストは Cookie を失うとデータに戻れないため長くする
SESSION_TTL = {"guest": timedelta(days=180), "registered": timedelta(days=30)}
# last_seen_at / 有効期限の更新間隔（毎リクエストで書き込まないため）
SESSION_TOUCH_INTERVAL = timedelta(minutes=10)
SESSION_COOKIE_NAME = "iws_session"
SECURE_SESSION_COOKIE_NAME = "__Host-iws_session"

# AI の日次利用上限（日付は JST）
AiKind = Literal["prd"]
AI_DAILY_QUOTAS: dict[str, dict[AiKind, int]] = {
    "guest": {"prd": 5},
    "registered": {"prd": 30},
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
# 計測イベントの受信（セッションごと）
EVENTS_RATE_LIMIT_PER_SESSION = (300, 60 * 60)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_SECONDS = 10

# /api/health の DB 接続確認（select 1）で、プールから接続を借りるまで待つ秒数
HEALTH_DB_TIMEOUT_SECONDS = 5

USER_AGENT_MAX_CHARS = 500

# フォールバック PRD で各メモから抜き出す本文の最大文字数
MOCK_FACT_MAX_CHARS = 100

DEFAULT_PROJECT_NAME = "Idea Workspace"

# 以下は src/config の値と揃える
UNTITLED_NOTE_LABEL = "無題のメモ"
DISPLAY_TIMEZONE = ZoneInfo("Asia/Tokyo")
