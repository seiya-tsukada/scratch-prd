"""ローカル Postgres の scratch_prd スキーマを作り直し（drop → マイグレーション → seed）、データを空にする。

本番（Supabase）には使わない。データを残したまま最新にするだけなら db_migrate を使う。

    uv run python -m backend.scripts.db_reset            # 開発用 DB（localhost:54322）
    uv run python -m backend.scripts.db_reset --no-seed
"""

from __future__ import annotations

import argparse
import os

import psycopg

from backend.scripts.db_migrate import (
    DEFAULT_DATABASE_URL,
    DEFAULT_LOCAL_APP_PASSWORD,
    apply_all,
    ensure_local,
    migration_files,
)


def reset_database(database_url: str, *, seed: bool = True, app_password: str = DEFAULT_LOCAL_APP_PASSWORD) -> None:
    ensure_local(database_url)
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("drop schema if exists scratch_prd cascade")
        apply_all(conn, seed=seed, app_password=app_password)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL_DIRECT", DEFAULT_DATABASE_URL))
    parser.add_argument("--no-seed", action="store_true", help="seed.sql を適用しない")
    args = parser.parse_args()

    reset_database(args.database_url, seed=not args.no_seed)
    seed_label = "なし" if args.no_seed else "あり"
    print(f"scratch_prd を作り直しました（{len(migration_files())} ファイル、seed={seed_label}）")


if __name__ == "__main__":
    main()
