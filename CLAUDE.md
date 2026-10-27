# CLAUDE.md

Idea Workspace（scratch-prd）で作業する Claude Code 向けのガイド。
思いつきのメモを、開発・検証できる PRD へ育てる個人向けワークスペース。
**アカウント登録は任意**で、未登録（ゲスト）でも全機能を使える。差がつくのは AI 利用上限だけ。

> 現在は移行中。Phase 4b でデータ層は FastAPI + Supabase Postgres に移行済み（Express・localStorage 実装は削除）。
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
| バックエンド | Python（FastAPI）。旧 Express サーバーは Phase 4b で削除済み |
| DB | Supabase の Postgres を**マネージド Postgres として**使う。専用スキーマ `idea_ws` のみ |
| 認証 | **自前実装**。ユーザーは `idea_ws.users`。セッションは不透明トークン（Cookie）＋ DB にハッシュ保存。JWT は使わない |
| 認可 | すべて Python 側。ユーザー配下データのクエリには必ず `user_id` 条件を付ける |
| AI | Gemini（公式 Python SDK `google-genai`）。responseSchema による構造化出力。失敗時は内蔵フォールバックで応答し、レスポンスでその旨を明示 |

### データの置き場所

| データ | 置き場所 |
|---|---|
| ユーザー・認証（users, user_identities, sessions, email_login_tokens, oauth_states） | `idea_ws` |
| ユーザーデータ（projects, sections, notes, prd_documents, prd_versions, workspace_preferences） | `idea_ws` |
| コンテンツ（section_templates, sample_contents） | `idea_ws`（デプロイ無しで初回体験を調整するため） |
| グロース計測（events, ai_generations, api_usage） | `idea_ws` |
| 秘密情報（DB 接続文字列・API キー・pepper 等） | Vercel の環境変数のみ。フロントに渡してよいのは `VITE_` 接頭辞の公開値だけ |
| ブラウザ | セッション Cookie（httpOnly）のみ。旧 localStorage（`idea_workspace_*_v2`）は初回インポート後に削除する |

### ゲストと登録

- 初回アクセスで `POST /api/auth/guest`（Turnstile 必須）→ `users(is_guest=true)` を作成しサンプルを複製。データは最初から DB に保存する。
- 登録は**メールアドレス + パスワード**（Phase 5。メールのマジックリンク・Google OAuth は保留）。**同じ users 行を昇格**させるのでデータ移行は不要。
- 既存アカウントにログインしたとき、ゲストにデータがあれば確認のうえ統合（merge）か破棄（discard）してからログインする（`POST /api/auth/login` の `guestData`）。
- 昇格・ログイン時はセッショントークンを再発行する。パスワードは Argon2id のハッシュのみ保存する。
- メールアドレスの確認・パスワード再設定は未実装（画面で明示している）。

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

フロント（Phase 4b 時点）:

```
src/
  config/                定数・定義（api.ts は AI・認証 API の型、prd.ts は表示定義、legacyStorage.ts は旧 localStorage キー）
  services/              apiWorkspaceRepository.ts（Workspace API）, noteSaveQueue.ts（メモの自動保存）,
                         legacyImport.ts（旧データの取り込み）, apiClient.ts, session.ts, turnstile.ts
  components/ hooks/ utils/ types/
```

バックエンド（Phase ごとに追加。Vercel の最新仕様に合わせて調整する場合は相談）:

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
                         （Phase 3 時点: main.py, config.py, db.py, security.py, sessions.py, models/{ai,auth}.py,
                          routers/{ai,auth}.py, services/{gemini,prompts,fallbacks,turnstile,rate_limit,samples,ai_usage}.py）
                         （Phase 4a で追加: models/workspace.py, routers/workspace.py, services/{workspace_repo,legacy_import}.py）
  scripts/               db_reset.py（ローカル DB の作り直し）
  tests/                 AI API・プロンプト・フォールバックのテスト、db/（スキーマ・権限・関数のテスト）
vercel.json              Vercel の設定（framework: fastapi、ビルド、Cron）。エントリポイントは pyproject.toml の [tool.vercel]
scripts/                 check-bundle-secrets.mjs（ビルド成果物の秘密情報検査）
.github/workflows/       ci.yml（lint / テスト / ビルド / 秘密情報検査）
supabase/migrations/     SQL マイグレーション（Supabase CLI 形式）
supabase/seed.sql        section_templates / sample_contents
docker-compose.yml       ローカル / テスト用 Postgres（Supabase の Postgres イメージ）
docs/                    migration-plan.md, supabase-setup.md, deploy.md（環境変数一覧とデプロイ手順）
pyproject.toml           Python 依存（uv で管理）
```

---

## ローカル開発

前提: Node.js、[uv](https://docs.astral.sh/uv/)（Python 3.12 を uv で用意する。システムの Python は使わない）、Docker（colima 等）。

```bash
npm install
uv sync                                     # Python 依存
cp .env.example .env                        # ローカル用の値入り。GEMINI_API_KEY は任意（未設定なら内蔵ジェネレータ）
docker compose up -d && uv run python -m backend.scripts.db_reset
npm run dev                                 # FastAPI（:8000）と Vite（:3000、/api を :8000 へ proxy）を同時起動
npm run dev:api / npm run dev:web           # 個別に起動する場合
npm run lint                                # tsc --noEmit
npm test                                    # vitest
```

DB（Phase 1〜）:

```bash
docker compose up -d                        # db（開発用 :54322）と db-test（pytest 用 :54323, tmpfs）
uv run python -m backend.scripts.db_reset   # 開発用 DB の idea_ws を作り直す（マイグレーション + seed）
uv run pytest                               # db-test を作り直してテスト
uv run ruff check backend && uv run ruff format --check backend && uv run mypy
```

- マイグレーションは `supabase/migrations/`（Supabase CLI 形式）、コンテンツの初期データは `supabase/seed.sql`。本番への適用手順は [docs/supabase-setup.md](docs/supabase-setup.md)。
- ローカルの `idea_ws_app` のパスワードは `idea_ws_app`（`db_reset` が設定する。本番では手作業で設定）。
- テーブルを追加するときは、同じマイグレーションで RLS 有効化・`idea_ws_app` への GRANT・`idea_ws_app` 用ポリシーを行う。

アカウント（Phase 5〜）:

- 登録・ログイン・統合は `backend/app/services/accounts.py`、アカウント設定は `routers/account.py`、定期処理は `routers/cron.py`（`CRON_SECRET`）。
- ログイン系は `rate_limit.enforce_rate_limit`（IP・メールアドレスごと、キーはハッシュ）を通す。失敗の文言でメールアドレスの有無を区別しない。
- フロントのログイン中ユーザーは `useSession()`（`GuestGate` の context）。別ユーザーに切り替わったときはページを読み直す。

認証・セッション（Phase 3〜）:

- 初回アクセスで `GuestGate` が `/api/auth/me` を確認し、無ければ Turnstile → `POST /api/auth/guest`。ローカルは Cloudflare 公式のテストキー（常に成功）を使う。
- Cookie は `iws_session`（ローカル）/ `__Host-iws_session`（`COOKIE_SECURE=true`）。トークンは DB に HMAC でのみ保存。
- 状態を変える API は `security.verify_origin`（`ALLOWED_ORIGINS`）を通す。ログインが必要な API は `sessions.CurrentUser` を受け取る。
- Gemini など外部 API を待つエンドポイントでは `Db` ではなく `Pool` を受け取り、DB 接続は使う間だけ借りる（プール枯渇を防ぐ）。
- API テストは `backend/tests/conftest.py` の `client` / `guest_client` を使う（Turnstile はモック、終了時にデータを削除）。

Workspace API（Phase 4a〜）:

- `backend/app/services/workspace_repo.py` の関数は必ず `user_id` を受け取り、全クエリに `user_id` 条件を付ける。他人・存在しない ID は `NotFoundError`（→ 404）。
- 新しいエンドポイントを足したら `backend/tests/test_workspace_isolation.py` の `ATTACKS` にも追加する（他人の ID で 404・データ不変を確認）。
- メモの自動保存は `PATCH /api/notes/{id}` に `baseUpdatedAt` を付ける。古ければ 409 と最新のメモが返る。
- 保存できるデータの上限は `config.MAX_*`（超過は 422 `limit_exceeded`）。旧 localStorage の取り込み（`/api/import/local-project`）だけ本文 4MB まで。

計測・デプロイ（Phase 6〜）:

- イベントは `backend/app/services/events.py` のホワイトリスト（`EVENT_SCHEMAS`）に追加してから使う。API で起きる出来事はサーバー側で `record_event`、画面上の操作だけ `src/services/analytics.ts` の `track`（`CLIENT_EVENTS`）。properties に個人情報・メモ本文を入れない。
- 本番では FastAPI が `dist/` も配信する（`app.frontend`）。セキュリティヘッダー（CSP など）は `main.py`。外部のスクリプト・画像を足すときは CSP も直す。
- 環境変数を足したら `docs/deploy.md` の表と `.env.example` を更新する。
- 初回の案内と「貼るだけ PRD」は `QuickPrdDialog` を共有する（Phase 7）。PRD 生成は `App.tsx` の `generatePrdFromNotes` に集約している。サーバー側の秘密は `scripts/check-bundle-secrets.mjs` の `SERVER_ONLY_ENV` にも足す。

AI（Phase 2〜）:

- AI の入力上限は `backend/app/config.py` と `src/config/api.ts` の `AI_INPUT_LIMITS` に同じ値を書く（`backend/tests/test_limits_sync.py` が検証）。
- AI が使えないときは内蔵ジェネレータで応答し、`usedFallback: true` と `fallbackReason` を返す。フロントは `FallbackNotice` で必ず明示する。
- Gemini を呼ぶときだけ日次クォータ（`config.AI_DAILY_QUOTAS`）を消費し、超過は 429（`quota_exceeded`）。すべての生成を `ai_generations` に記録する。

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
- データアクセスは `IWorkspaceRepository`（`services/apiWorkspaceRepository.ts`）経由に限定し、コンポーネントから `fetch` を直接呼ばない（`services/` に置く）。
- メモの編集は画面を先に更新し、保存は `NoteSaveQueue` に任せる（メモごとに直列化・競合時は「（競合コピー）」として退避）。それ以外の操作は API の結果を待ってから画面に反映する。
- localStorage はデータの保存に使わない（例外: 最後に開いたプロジェクト ID などの表示上の利便のみ）。
- テストは vitest。`npm run lint` と `npm test` を通す。
