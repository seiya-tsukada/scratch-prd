# CLAUDE.md

Idea Workspace（scratch-prd）で作業する Claude Code 向けのガイド。
思いつきのメモを、開発・検証できる PRD へ育てる個人向けワークスペース。
**アカウント登録は任意**で、未登録（ゲスト）でも全機能を使える。差がつくのは AI 利用上限だけ。

> 現在は移行中。Express + localStorage の構成から、Vite SPA + FastAPI + Supabase Postgres（自前認証）へ段階的に作り替えている。
> フェーズごとの計画と進捗は [docs/migration-plan.md](docs/migration-plan.md) を参照。

---

## アーキテクチャ（目標）

```
Browser (Vite SPA, React 19 + Tailwind 4)
  │  fetch('/api/...', { credentials: 'same-origin' })   ← httpOnly Cookie セッション
  ▼
Vercel（同一リポジトリ・同一ドメイン）
  ├─ 静的配信: dist/（/api 以外は index.html にフォールバック）
  └─ Vercel Function: FastAPI（/api/*）
        auth / workspace / ai / events / account / cron
              │  psycopg 3（Supavisor transaction mode）
              ▼
        Supabase Postgres  schema: idea_ws
        （Data API 非公開・RLS 有効・anon/authenticated からは REVOKE）
```

| 領域 | 方針 |
|---|---|
| フロント | Vite の静的ビルド。DB には一切触らず、すべて `/api` 経由 |
| バックエンド | Python（FastAPI）。Express（`server.ts`, `server/*`）は移行完了後に削除する |
| DB | Supabase の Postgres を**マネージド Postgres として**使う。専用スキーマ `idea_ws` のみ |
| 認証 | **自前実装**。ユーザーは `idea_ws.users`。セッションは不透明トークン（Cookie）＋ DB にハッシュ保存。JWT は使わない |
| 認可 | すべて Python 側。ユーザー配下データのクエリには必ず `user_id` 条件を付ける |
| AI | Gemini（公式 Python SDK `google-genai`）。responseSchema による構造化出力。失敗時は内蔵フォールバックで応答し、レスポンスでその旨を明示 |

### データの置き場所

| データ | 置き場所 |
|---|---|
| ユーザー・認証（users, user_identities, sessions, email_login_tokens, oauth_states） | `idea_ws` |
| ユーザーデータ（projects, sections, notes, prd_documents, prd_versions, workspace_preferences） | `idea_ws` |
| コンテンツ（section_templates, sample_contents） | `idea_ws`（デプロイ無しで初回体験を調整するため。`src/config/seed.ts` は移行後に削除） |
| グロース計測（events, ai_generations, api_usage） | `idea_ws` |
| 秘密情報（DB 接続文字列・API キー・pepper 等） | Vercel の環境変数のみ。フロントに渡してよいのは `VITE_` 接頭辞の公開値だけ |
| ブラウザ | セッション Cookie（httpOnly）のみ。旧 localStorage（`idea_workspace_*_v2`）は初回インポート後に削除する |

### ゲストと登録

- 初回アクセスで `POST /api/auth/guest`（Turnstile 必須）→ `users(is_guest=true)` を作成しサンプルを複製。データは最初から DB に保存する。
- 登録（メールのマジックリンク / Google OAuth + PKCE）は**同じ users 行を昇格**させるのでデータ移行は不要。
- 既に登録済みの identity でログインした場合は、確認のうえ `POST /api/account/merge` でゲストのデータを統合する。
- 昇格・ログイン時はセッショントークンを再発行する。

---

## 禁止事項（例外なし。必要に見えたら実装せずに相談する）

- **Supabase Auth / `auth.users` / `auth.uid()` を使わない。** Supabase Auth 前提の RLS ポリシーも書かない。
- **フロントから DB に接続しない。** `@supabase/supabase-js` などをフロントに入れない。
- **Supabase のキー（anon / service_role / publishable / secret）や DB 接続文字列をフロントに渡さない。** `VITE_` 接頭辞の環境変数に秘密情報を入れない。
- **`public` スキーマにテーブル・関数・ビューを作らない。** すべて `idea_ws` に作る。
- **`idea_ws` を Supabase Data API（PostgREST）の Exposed schemas に追加しない。**
- **RLS を無効化しない。** `idea_ws` の全テーブルで RLS を有効にし、ポリシーはアプリ用ロール `idea_ws_app` 向けだけを作る（`anon` / `authenticated` / `service_role` 向けは作らない）。
- **ユーザー配下データのクエリで `user_id` 条件を省略しない。** 他人のリソース ID を指定されたら 404 を返す（403 で存在を漏らさない）。
- セッショントークン・ログイントークンを平文で DB に保存しない（HMAC ハッシュのみ）。IP アドレスを生で保存しない。
- JWT をセッションに使わない。`localStorage` に認証情報を置かない。
- 方針（本ファイル・`docs/migration-plan.md`）と矛盾する実装を独断で行わない。外部サービスの仕様（Vercel / Supabase / Google OAuth / Turnstile / Resend / Gemini）は実装前に最新の公式ドキュメントで確認する。

---

## ディレクトリ構成

現状（移行前）:

```
server.ts                Express エントリ（API・静的配信）※Phase 4 で削除
server/                  プロンプト・フォールバック・Gemini 呼び出し ※Phase 2 で Python へ移植、Phase 4 で削除
src/
  config/                定数・定義（api.ts は API の型、prd.ts は表示定義、seed.ts はサンプル）
  services/              workspaceRepository.ts（localStorage 実装）, apiClient.ts
  components/ hooks/ utils/ types/
```

目標（Phase ごとに追加。Vercel の最新仕様に合わせて調整する場合は相談）:

```
backend/
  app/
    main.py              FastAPI app
    config.py            環境変数・上限値などの定数
    db.py                接続管理（psycopg 3）
    security.py          セッション・CSRF・トークンハッシュ
    models/              pydantic スキーマ
    routers/             auth, workspace, ai, events, account, cron
    services/            gemini, prompts, fallbacks, rate_limit, mailer, turnstile, samples
  scripts/               db_reset.py（ローカル DB の作り直し）
  tests/                 db/（スキーマ・権限・関数のテスト）
api/                     Vercel の Python エントリポイント（Phase 6 で確定）
supabase/migrations/     SQL マイグレーション（Supabase CLI 形式）
supabase/seed.sql        section_templates / sample_contents
docker-compose.yml       ローカル / テスト用 Postgres（Supabase の Postgres イメージ）
docs/                    migration-plan.md, supabase-setup.md, deploy.md
pyproject.toml           Python 依存（uv で管理）
```

---

## ローカル開発

前提: Node.js、[uv](https://docs.astral.sh/uv/)（Python 3.12 を uv で用意する。システムの Python は使わない）、Docker（colima 等）。

```bash
npm install
cp .env.example .env
npm run dev          # 現状: Express + Vite（http://localhost:3000）
npm run lint         # tsc --noEmit
npm test             # vitest
```

DB（Phase 1〜）:

```bash
uv sync                                     # Python 依存
docker compose up -d                        # db（開発用 :54322）と db-test（pytest 用 :54323, tmpfs）
uv run python -m backend.scripts.db_reset   # 開発用 DB の idea_ws を作り直す（マイグレーション + seed）
uv run pytest                               # db-test を作り直してテスト
uv run ruff check backend && uv run ruff format --check backend && uv run mypy
```

- マイグレーションは `supabase/migrations/`（Supabase CLI 形式）、コンテンツの初期データは `supabase/seed.sql`。本番への適用手順は [docs/supabase-setup.md](docs/supabase-setup.md)。
- ローカルの `idea_ws_app` のパスワードは `idea_ws_app`（`db_reset` が設定する。本番では手作業で設定）。
- テーブルを追加するときは、同じマイグレーションで RLS 有効化・`idea_ws_app` への GRANT・`idea_ws_app` 用ポリシーを行う。

Phase 2 以降で追加予定（確定したらここを更新する）:

```bash
uv run uvicorn backend.app.main:app --reload --port 8000
npm run dev:web                           # Vite（/api を :8000 へ proxy）
```

---

## コーディング規約

### 共通
- コメント・UI 文言・ドキュメントは日本語。識別子は英語。
- 定数（上限値・タイミング・ラベル）はハードコードせず config に集約する（TS は `src/config/*`、Python は `backend/app/config.py`）。
- 1 Phase = 1 ブランチ = 1 PR。Phase をまたぐ変更をしない。手作業が必要な設定は `docs/` のチェックリストに書く。

### Python
- 型ヒント必須（関数の引数・戻り値すべて）。`ruff`（lint/format）と `mypy --strict` 相当を通す。
- API の入出力は pydantic モデルで定義する。フロントの型（`src/config/api.ts`, `src/types/index.ts`）と JSON のキー名（camelCase）を一致させる（pydantic の alias で変換）。
- SQL は psycopg のパラメータバインドのみ。文字列連結で SQL を組まない。
- テストは pytest。Gemini・メール・Turnstile・Google は必ずモック。DB を使うテストはローカル / CI の Postgres に対して実行する。
- 認可漏れを防ぐため、ユーザー配下データのリポジトリ関数は第 1 引数に `user_id` を必須で取る。

### TypeScript / React
- 既存規約を踏襲: 関数コンポーネント + hooks、Tailwind のクラスは完全な文字列で書く（動的生成しない）、`src/config/api.ts` が API の型の単一の出所。
- データアクセスは `IWorkspaceRepository` 経由に限定し、コンポーネントから `fetch` を直接呼ばない（`services/` に置く）。
- テストは vitest。`npm run lint` と `npm test` を通す。
