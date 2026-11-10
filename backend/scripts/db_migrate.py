"""ローカル Postgres に supabase/migrations/*.sql（名前順）と seed を適用する。データは消さない。

マイグレーションは冪等（何度実行しても同じ状態）なので、毎回すべてのファイルを流す。
本番（Supabase）には使わない。本番は docs/supabase-setup.md の手順（psql）で同じファイルを流す。

    uv run python -m backend.scripts.db_migrate            # 開発用 DB（localhost:54322）
    uv run python -m backend.scripts.db_migrate --no-seed
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any
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
    """誤って本番 DB に実行しないよう、ローカルホスト以外は拒否する"""
    host = urlparse(database_url).hostname
    if host not in LOCAL_HOSTS:
        raise SystemExit(f"ローカル以外の DB には実行できません: host={host}")


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def apply_file(conn: psycopg.Connection[Any], path: Path) -> None:
    """ファイル単位でトランザクションにする（本番の psql -1 と同じ粒度）"""
    with conn.transaction():
        conn.execute(path.read_text(encoding="utf-8").encode())


def apply_all(
    conn: psycopg.Connection[Any], *, seed: bool = True, app_password: str = DEFAULT_LOCAL_APP_PASSWORD
) -> None:
    """autocommit の接続に、マイグレーション・seed・idea_ws_app のローカル用パスワードを適用する"""
    for path in migration_files():
        apply_file(conn, path)
    if seed:
        apply_file(conn, SEED_FILE)
    conn.execute(
        sql.SQL("alter role {} with login password {}").format(sql.Identifier(APP_ROLE), sql.Literal(app_password))
    )


def migrate_database(database_url: str, *, seed: bool = True) -> None:
    ensure_local(database_url)
    with psycopg.connect(database_url, autocommit=True) as conn:
        apply_all(conn, seed=seed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL_DIRECT", DEFAULT_DATABASE_URL))
    parser.add_argument("--no-seed", action="store_true", help="seed.sql を適用しない")
    args = parser.parse_args()

    migrate_database(args.database_url, seed=not args.no_seed)
    seed_label = "なし" if args.no_seed else "あり"
    print(f"scratch_prd にマイグレーションを適用しました（{len(migration_files())} ファイル、seed={seed_label}）")


if __name__ == "__main__":
    main()
