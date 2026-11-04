# Idea Workspace

思いつきのメモを、開発・検証できる PRD へ育てる個人向けワークスペース。
アカウント登録は任意で、登録しなくても（ゲストのまま）すべての機能を使える。

## 構成

| 領域 | 技術 |
|---|---|
| フロント | Vite + React 19 + Tailwind CSS 4（`src/`） |
| バックエンド | FastAPI（Python 3.12、`backend/`） |
| DB | Supabase の Postgres を専用スキーマ `idea_ws` で利用（`supabase/migrations/`） |
| 認証 | 自前のゲストセッション（httpOnly Cookie）＋ 任意のメールアドレス + パスワード登録 |
| AI | Gemini（未設定なら内蔵ジェネレータで応答し、その旨を画面に表示） |
| ホスティング | Vercel（FastAPI が API と画面の両方を配信） |

フロントは DB に直接アクセスせず、すべて `/api` 経由。方針・禁止事項・規約は [CLAUDE.md](CLAUDE.md)、経緯は [docs/migration-plan.md](docs/migration-plan.md)。

```
src/                     フロント（components / services / config / utils / types）
backend/app/             FastAPI（routers / services / models / config / db / security / sessions）
backend/tests/           pytest（db/ はスキーマ・権限のテスト）
supabase/migrations/     マイグレーション（Supabase CLI 形式）、supabase/seed.sql はサンプルとテンプレート
scripts/                 ビルド成果物の秘密情報検査
docs/                    supabase-setup.md（Supabase の手作業）、deploy.md（Vercel へのデプロイ）
```

## ローカルでの起動

前提: Docker（colima 等）。ホストで動かす場合は Node.js 24 以降と [uv](https://docs.astral.sh/uv/) も必要。

### docker compose だけで起動する

```bash
cp .env.example .env                        # ローカル用の値入り。GEMINI_API_KEY は任意
docker compose up --build                   # http://localhost:3000
```

- `db`（Postgres）→ `migrate`（idea_ws が無ければマイグレーションと seed）→ `api`（FastAPI :8000）→ `web`（Vite :3000）の順に起動する。
- `backend/` と `src/` の変更は自動で反映される。依存（`package.json` / `pyproject.toml`）を変えたら `docker compose up --build`。
- 新しいマイグレーションを追加すると `migrate` が「古い」と止まる。`npm run docker:db-reset`（ローカルのデータは消える）で作り直す。
- ほかのアプリとポートがぶつかる場合は `.env` の `DB_PORT` / `DB_TEST_PORT` / `API_PORT` / `WEB_PORT` を変える。
- 通知（メール送信など）はローカルでは再現しない。Turnstile は Cloudflare 公式のテストキー（常に成功）を使う。

### API と画面をホストで動かす

```bash
npm install
uv sync
cp .env.example .env
docker compose up -d db db-test             # Postgres（開発用 :54322 / テスト用 :54323）
uv run python -m backend.scripts.db_reset   # 開発用 DB にマイグレーションとサンプルを適用
npm run dev                                 # http://localhost:3000（FastAPI :8000 と Vite を同時起動）
```

テスト（`uv run pytest`）はどちらの方法でも `db-test` を使う。

### dev 環境の構成

```
ブラウザ http://localhost:3000
  │
  ▼
web     Vite（node:24）……… /api を api へ転送。src/ の変更を即反映
  │  http://api:8000
  ▼
api     FastAPI（python:3.12 + uv）… backend/ の変更で自動再起動
  │  postgresql://idea_ws_app@db:5432
  ▼
db      Postgres（supabase/postgres）… データはボリューム scratch-prd_db-data
  ▲
migrate 起動時に 1 回だけ動く（idea_ws が無ければマイグレーション + seed）

db-test pytest 用の Postgres（tmpfs。止めると消える）
```

| サービス | イメージ / Dockerfile | ホスト側ポート（`.env` で変更） | 役割 |
|---|---|---|---|
| `db` | `supabase/postgres` | 54322（`DB_PORT`） | 開発用 DB。Supabase と同じイメージなので `anon` などのロールもある |
| `db-test` | `supabase/postgres` | 54323（`DB_TEST_PORT`） | `uv run pytest` 用。毎回作り直す |
| `migrate` | `docker/api.Dockerfile` | なし | `db_reset --if-empty`。終了してから `api` が起動する |
| `api` | `docker/api.Dockerfile` | 8000（`API_PORT`） | FastAPI。`backend/` をマウント |
| `web` | `docker/web.Dockerfile` | 3000（`WEB_PORT`） | Vite。リポジトリ全体をマウント |

- イメージに入れるのは依存だけで、ソースはマウントする。Python の仮想環境はコンテナ内の `/opt/venv`、`node_modules` はボリューム `scratch-prd_web-node-modules` に置き、ホストの `.venv` / `node_modules`（macOS 用）とは混ぜない。
- `api` の DB の接続先・`COOKIE_SECURE=false`・`ALLOWED_ORIGINS` などは `docker-compose.yml` で固定している（`.env` の値より優先）。`GEMINI_API_KEY` などそれ以外は `.env` から読む。
- 本番（Vercel + Supabase）との違い:

| | dev（docker compose） | 本番（Vercel） |
|---|---|---|
| DB | `db` コンテナ | Supabase の Postgres（Transaction pooler 経由） |
| 画面の配信 | Vite の開発サーバー | `npm run build` の `dist/` を FastAPI が配信 |
| Turnstile | 公式のテストキー（常に成功） | 本番のキー |
| Cookie | `iws_session`（http） | `__Host-iws_session`（https） |
| 通知（メールなど） | 再現しない | （現在は未実装） |
| Cron | 動かない（手動なら `curl -H "Authorization: Bearer $CRON_SECRET" localhost:8000/api/cron/cleanup`） | Vercel Cron |

`docker/` と `docker-compose.yml` はローカル専用で、Vercel のデプロイには含めない（`vercel.json` の `excludeFiles`）。

### データとボリューム

ローカルで作ったデータ（ゲスト・プロジェクト・メモ・PRD・計測イベントなど）は、Docker のボリューム **`scratch-prd_db-data`** に保存される。リポジトリの外（Docker の VM の中）にあるため、**Git・GitHub には入らない**。

Git で管理しているのは DB の初期状態だけ:

| ファイル | 中身 |
|---|---|
| `supabase/migrations/*.sql` | スキーマ（テーブル・関数・権限・RLS） |
| `supabase/seed.sql` | `section_templates`（セクションのひな形）と `sample_contents`（新しいゲストに複製するサンプル） |

データが残るか・消えるか:

| 操作 | `db`（開発用） | `db-test` |
|---|---|---|
| `docker compose stop` / `down`、PC の再起動 | 残る | 消える |
| `docker compose up --build`（イメージの作り直し） | 残る | 消える |
| `npm run docker:db-reset` | **消える**（スキーマと seed だけの状態に戻る） | — |
| `docker compose down -v` | **消える**（ボリュームごと削除） | 消える |

マイグレーションを追加したときは、`migrate` が「古い」と表示して止まる（データを勝手に消さないため）。`npm run docker:db-reset` で作り直す。

作り直す前にデータを残したい場合のバックアップと戻し方（同じマイグレーションの状態に戻す場合のみ）:

```bash
docker compose exec -T db pg_dump -U postgres --schema=idea_ws --no-owner > backup.sql
```

```bash
docker compose exec -T db psql -U postgres -q -c 'drop schema idea_ws cascade'
```

```bash
docker compose exec -T db psql -U postgres -q -v ON_ERROR_STOP=1 < backup.sql
```

`backup.sql` にはメモの本文やハッシュ化したセッションが含まれるため、コミットしない（`.gitignore` には入っていないので置き場所に注意する）。サンプルの内容をチームで共有したい場合は `supabase/seed.sql` を編集する。

DB の中を見る場合: `docker compose exec db psql -U postgres`（例 `select * from idea_ws.funnel_daily;`）。

## コマンド

| コマンド | 内容 |
|---|---|
| `docker compose up --build` | DB・API・画面をまとめて起動 |
| `npm run docker:db-reset` | docker compose の開発用 DB を作り直す（データは消える） |
| `npm run dev` | FastAPI と Vite をホストで同時起動（`/api` は Vite が :8000 へ転送） |
| `npm run lint` / `npm test` | 型チェック / vitest |
| `npm run build` / `npm run check:bundle` | フロントのビルド / ビルド成果物に秘密情報が無いことの検査 |
| `uv run pytest` | バックエンドのテスト（テスト用 DB を作り直して実行） |
| `uv run ruff check backend && uv run mypy` | Python の lint / 型チェック |

GitHub Actions（[.github/workflows/ci.yml](.github/workflows/ci.yml)）が PR ごとに上記をすべて実行する。

## 開発フロー

環境は **ローカル（docker compose）** と **本番（Vercel の Production）** の 2 つだけ。プレビュー環境は使わず、PR の動作確認はローカルの docker compose で行う。

```
ブランチを作る → ローカルで実装・確認 → PR（CI） → レビュアーがローカルで動作確認 → main にマージ → 本番に自動デプロイ → 本番で確認
```

### 1. 実装する人

1. `main` から作業ブランチを作る（1 Phase = 1 ブランチ = 1 PR）。
2. `docker compose up --build` で起動し、http://localhost:3000 で変更を確認する。
3. マイグレーションを追加した場合は `npm run docker:db-reset` で作り直し、サンプルから始まる状態でも動くことを確認する。
4. 次のチェックを通す（CI と同じ内容）。

   ```bash
   npm run lint && npm test && npm run build && npm run check:bundle
   ```

   ```bash
   docker compose up -d db-test && uv run pytest
   ```

   ```bash
   uv run ruff check backend && uv run ruff format --check backend && uv run mypy
   ```

5. PR を作る。説明には「何を変えたか」と「ローカルでの確認手順」（どの画面で何をすると何が起きるか）を書く。マイグレーション・環境変数・手作業が必要な設定があれば明記する。

### 2. レビューする人（PR の動作確認）

```bash
git fetch origin && git switch <PR のブランチ>
```

```bash
docker compose up --build
```

- PR に書かれた確認手順を http://localhost:3000 で行う。
- `migrate` が「古い」と止まったら（PR にマイグレーションがある）、`npm run docker:db-reset` で作り直す。手元のデータを残したい場合は先にバックアップを取る（[データとボリューム](#データとボリューム)）。
- 確認が終わったら `git switch main` で戻る。PR のマイグレーションを入れた DB のままだと `main` で動かないことがあるので、そのときも `npm run docker:db-reset` で作り直す。
- ローカルでは Turnstile はテストキー、通知は再現しない、AI は `GEMINI_API_KEY` が無ければ内蔵ジェネレータになる。これらに関わる変更は、本番デプロイ後の確認で見る。

### 3. マージと本番デプロイ

1. CI が通り、ローカルでの確認が済んだら `main` にマージする。
2. Vercel が `main` を本番にデプロイする。マイグレーションがある場合は、**マージの前に** 本番の Supabase へ適用しておく（[docs/supabase-setup.md](docs/supabase-setup.md)）。
3. 本番で [docs/deploy.md](docs/deploy.md) の「本番デプロイ後の確認」を行う。

## デプロイ

[docs/deploy.md](docs/deploy.md)（環境変数・初回セットアップ・デプロイ後の確認）と [docs/supabase-setup.md](docs/supabase-setup.md)（Supabase の手作業）を参照。

## 2 つのブラウザでデータが混ざらないことの確認

データはブラウザごとのゲストユーザー（Cookie のセッション）に紐づく。次の手順で確認できる。
（自動テストでは `backend/tests/test_workspace_isolation.py` が全 API について同じことを検証している）

1. `docker compose up --build`（または `npm run dev`）で起動する。
2. ブラウザ A で http://localhost:3000 を開く。サンプルのプロジェクトが表示される。
3. ブラウザ A でメモを作り「ブラウザ A のメモ」と入力し、「自動保存完了」になるのを待つ。
4. ブラウザ B（別のブラウザ、またはシークレットウィンドウ）で開く。サンプルだけが表示され、「ブラウザ A のメモ」が無いことを確認する。
5. ブラウザ B でメモを作り「ブラウザ B のメモ」と入力する。
6. ブラウザ A を再読み込みし、「ブラウザ A のメモ」があり「ブラウザ B のメモ」が無いことを確認する。

## アカウントとデータ

- ゲストのデータはこのブラウザの Cookie に紐づく。Cookie を削除すると戻れないため、画面から登録を案内する（押し付けない）。
- 登録すると今のデータをそのまま引き継ぐ。別のブラウザでログインすると、そのブラウザのゲストのデータを統合するか選べる。
- メールアドレスの確認・パスワードの再設定は未実装（画面で明示している）。
- 以前のバージョンがブラウザの localStorage に残したデータは、開いたときに取り込むか確認する。

## 計測

API で起きる出来事（ゲスト作成・メモ作成・PRD 生成・登録など）はサーバー側で、画面上の操作（コピー・ダウンロード・登録の案内など）はフロントから `idea_ws.events` に記録する。
集計ビュー `idea_ws.funnel_daily`（ファネル）と `idea_ws.ai_fallback_daily`（AI のフォールバック率）を SQL Editor で参照する。
