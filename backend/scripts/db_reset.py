"""ローカル Postgres の idea_ws スキーマを作り直し、マイグレーションと seed を適用する。

本番（Supabase）には使わない。本番は docs/supabase-setup.md の手順（Supabase CLI）で適用する。

    uv run python -m backend.scripts.db_reset            # 開発用 DB（localhost:54322）
    uv run python -m backend.scripts.db_reset --no-seed
    uv run python -m backend.scripts.db_reset --if-empty  # 無いときだけ作成（docker compose の migrate）
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from psycopg import sql

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
SEED_FILE = REPO_ROOT / "supabase" / "seed.sql"

DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:54322/postgres"
# docker compose のサービス名（db / db-test）もローカルとみなす
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "db", "db-test"}

APP_ROLE = "idea_ws_app"
# ローカル専用。本番のパスワードは Supabase 上で手作業で設定する
DEFAULT_LOCAL_APP_PASSWORD = "idea_ws_app"


def ensure_local(database_url: str) -> None:
    """誤って本番 DB を作り直さないよう、ローカルホスト以外は拒否する"""
    host = urlparse(database_url).hostname
    if host not in LOCAL_HOSTS:
        raise SystemExit(f"ローカル以外の DB には実行できません: host={host}")


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


# どのマイグレーションまで適用したかを、スキーマのコメントに記録する（ローカル専用）
SCHEMA_VERSION_PREFIX = "db_reset: "


def latest_migration() -> str:
    files = migration_files()
    return files[-1].name if files else ""


def schema_state(database_url: str) -> str:
    """idea_ws の状態: missing（無い）/ current（最新）/ outdated（古い、または db_reset 以外で作成）"""
    ensure_local(database_url)
    with psycopg.connect(database_url) as conn:
        row = conn.execute(
            "select obj_description(oid, 'pg_namespace') from pg_namespace where nspname = 'idea_ws'"
        ).fetchone()
    if row is None:
        return "missing"
    return "current" if row[0] == SCHEMA_VERSION_PREFIX + latest_migration() else "outdated"


def reset_database(database_url: str, *, seed: bool = True, app_password: str = DEFAULT_LOCAL_APP_PASSWORD) -> None:
    ensure_local(database_url)
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("drop schema if exists idea_ws cascade")

        for path in migration_files():
            # ファイル単位でトランザクションにする（Supabase CLI と同じ粒度）
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8").encode())

        if seed:
            with conn.transaction():
                conn.execute(SEED_FILE.read_text(encoding="utf-8").encode())

        conn.execute(
            sql.SQL("comment on schema idea_ws is {}").format(sql.Literal(SCHEMA_VERSION_PREFIX + latest_migration()))
        )
        conn.execute(
            sql.SQL("alter role {} with login password {}").format(sql.Identifier(APP_ROLE), sql.Literal(app_password))
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL_DIRECT", DEFAULT_DATABASE_URL))
    parser.add_argument("--no-seed", action="store_true", help="seed.sql を適用しない")
    parser.add_argument(
        "--if-empty", action="store_true", help="idea_ws が無いときだけ作成する（最新なら何もせず、古ければ停止）"
    )
    args = parser.parse_args()

    if args.if_empty:
        state = schema_state(args.database_url)
        if state == "current":
            print(f"idea_ws は最新です（{latest_migration()}）。何もしません")
            return
        if state == "outdated":
            raise SystemExit(
                "idea_ws が最新のマイグレーションより古いため停止しました"
                "（データを消さないため自動では作り直しません）。\n"
                "作り直す場合（ローカルのデータは消えます）: npm run docker:db-reset"
            )

    reset_database(args.database_url, seed=not args.no_seed)
    seed_label = "なし" if args.no_seed else "あり"
    print(f"idea_ws を作り直しました（{len(migration_files())} マイグレーション、seed={seed_label}）")


if __name__ == "__main__":
    main()
