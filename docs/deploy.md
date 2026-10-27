# デプロイ手順（Vercel + Supabase）

構成: 1 つの Vercel プロジェクトに FastAPI（`backend/app/main.py`）をデプロイし、Vite のビルド結果（`dist/`）も FastAPI が配信する。
DB は Supabase の Postgres（`idea_ws` スキーマ）。設定ファイルは [vercel.json](../vercel.json) と `pyproject.toml` の `[tool.vercel]`。

- 参考: [Vercel – FastAPI](https://vercel.com/docs/frameworks/backend/fastapi) / [Python runtime](https://vercel.com/docs/functions/runtimes/python) / [Cron jobs](https://vercel.com/docs/cron-jobs)

## 環境の分け方

| 環境 | Vercel | DB |
|---|---|---|
| Production | `main` ブランチ | 本番用の Supabase プロジェクト |
| Preview | PR・ブランチごとのデプロイ | **本番とは別の** Supabase プロジェクト（プレビューから本番データを触らない） |
| Development | ローカル（`npm run dev`） | docker compose の Postgres |

## 環境変数

Vercel の Project Settings → Environment Variables で、環境ごとに設定する。`VITE_` で始まる値はビルド時にフロントへ埋め込まれる（公開値のみ）。

| 変数 | Production | Preview | Development（`.env`） | 説明 |
|---|---|---|---|---|
| `DATABASE_URL` | 本番 DB の Transaction pooler（ユーザー `idea_ws_app.<project-ref>`） | プレビュー用 DB の同上 | `postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres` | バックエンドの接続先（[supabase-setup.md](supabase-setup.md) §5） |
| `DATABASE_URL_DIRECT` | **設定しない** | **設定しない** | ローカルの直接接続 | マイグレーション専用（手元から `supabase db push` するときだけ使う） |
| `SESSION_TOKEN_PEPPER` | ランダムな長い文字列 | Production とは別の値 | `.env.example` の値 | トークン・IP の HMAC 鍵。変えると全セッションが無効になる |
| `ALLOWED_ORIGINS` | 本番ドメイン（例 `https://idea-workspace.example.com`） | 空でよい | `http://localhost:3000` | 状態を変える API を許可する Origin（カンマ区切り）。Vercel のデプロイ URL（`VERCEL_URL` など）は自動で追加される |
| `COOKIE_SECURE` | `true` | `true` | `false` | `true` で Cookie 名が `__Host-iws_session` になり HSTS を付ける |
| `TRUST_PROXY_HEADERS` | `true` | `true` | `false` | `x-forwarded-for` を信頼する（Vercel が上書きするため） |
| `TURNSTILE_SECRET_KEY` | 本番ウィジェットの秘密鍵 | 同じウィジェットでよい | テスト用キー `1x0000000000000000000000000000000AA` | ゲスト作成時の bot 対策 |
| `VITE_TURNSTILE_SITE_KEY` | 本番ウィジェットのサイトキー | 同上 | テスト用キー `1x00000000000000000000AA` | ビルド時に埋め込まれる公開値 |
| `CRON_SECRET` | 16 文字以上のランダム文字列 | 不要（Cron は Production でのみ動く） | 任意 | `GET /api/cron/cleanup` の認証 |
| `GEMINI_API_KEY` | 任意 | 任意 | 任意 | 未設定なら内蔵ジェネレータで応答（`usedFallback: true`） |
| `GEMINI_MODEL` | 任意（既定 `gemini-3.8-flash`） | 任意 | 任意 | |

ランダムな値の作り方:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> 指示書にあった `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `RESEND_API_KEY` / `MAIL_FROM` / `APP_BASE_URL` は、メール送信・Google ログインを保留しているため不要（[migration-plan.md](migration-plan.md) Phase 5 の保留事項）。

## 初回セットアップ チェックリスト

### Supabase（Production と Preview の 2 プロジェクト）
- [ ] [supabase-setup.md](supabase-setup.md) の手順を、それぞれのプロジェクトで行う（マイグレーション・seed・`idea_ws_app` のパスワード・Data API に `idea_ws` を出さない）
- [ ] それぞれの `DATABASE_URL`（Transaction pooler、ユーザー `idea_ws_app.<project-ref>`）を控える

### Cloudflare Turnstile
- [ ] ウィジェットを作成し、サイトキーと秘密鍵を控える
- [ ] 許可するホスト名に、本番ドメインと `vercel.app`（プレビュー用）を追加する

### Vercel
- [ ] GitHub リポジトリを Import する。Framework Preset は `vercel.json` の `"framework": "fastapi"` が使われる
- [ ] Node.js のバージョンを 24.x にする（Project Settings → Build and Deployment）
- [ ] 上の表のとおり環境変数を Production / Preview に設定する
- [ ] 本番ドメインを設定し、`ALLOWED_ORIGINS` に入れる

## デプロイ後の確認（プレビューで先に行う）

1. ビルドログで次を確認する
   - `npm ci && npm run build && npm run check:bundle` が成功し、「秘密情報の検査: 問題なし」が出ている
   - Python の依存が `pyproject.toml` / `uv.lock` からインストールされている
   - ⚠️ FastAPI のプロジェクトでビルドコマンドに Node.js が使えることはドキュメントに明記されていない。失敗した場合は、Vercel Services（ベータ）でフロントとバックエンドを分ける構成に切り替える（[Services](https://vercel.com/docs/services)）
2. `https://<デプロイ URL>/api/health` が `{"status":"ok",...}` を返す
3. 画面を開き、ゲストとして始まる（Turnstile が表示され、サンプルのプロジェクトが出る）
4. メモを作成・編集し、再読み込みしても残っている
5. PRD を生成できる（`GEMINI_API_KEY` が無ければ「内蔵ジェネレータで作成しました」と表示される）
6. 「登録してデータを保護」からメールアドレス + パスワードで登録できる。別のブラウザでログインして同じデータが見える
7. 画面の URL（例 `/projects/xxx`）を直接開いても画面が出る。存在しない `/api/...` は 404 になる
8. レスポンスヘッダーに `Content-Security-Policy`・`Strict-Transport-Security` が付いている
9. （Production のみ）Vercel の Cron Jobs タブで `/api/cron/cleanup` が登録されている。手動で確認する場合:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<本番ドメイン>/api/cron/cleanup
```

## ローカルで `vercel dev` を使う場合（参考）

```bash
npm run build                                       # FastAPI が配信する dist/ を作る
VERCEL_TELEMETRY_DISABLED=1 npx vercel@64.0.2 dev --local --listen 3000
```

- `--local` ではプロジェクトにリンクせず、環境変数は `.env` から読む（シェルの環境変数は Python に渡らない）。`.env` の `ALLOWED_ORIGINS` に合わせて `--listen 3000` で起動する
- 確認済み（Phase 6 時点）: FastAPI プリセットとエントリポイントが認識され、`/` で dist/ の画面、画面の URL で `index.html`、存在しない `/api/...` は 404、CSP などのヘッダー、`/api/cron/cleanup` は秘密が無いと 401
- ⚠️ 既知の問題: CLI 64.0.2 / 65.3.1 の `--local` モードでは、ブラウザから同時に複数のリクエストが来ると CLI が Python の開発サーバーを停止し、その後のリクエストが `FUNCTION_INVOCATION_FAILED`（500）になる（ログに `ECONNREFUSED`）。1 件ずつのリクエストでは動く。アプリ側の問題ではないため、日常の開発は `npm run dev` を使い、本番相当の確認はプレビューデプロイで行う

## 運用メモ

- Cron は Hobby プランでは 1 日 1 回（`0 18 * * *` = JST 3 時台のどこか）。失敗しても再試行されないが、掃除処理は何度実行しても安全
- 関数の実行時間は `vercel.json` の `maxDuration: 90`（Gemini のタイムアウト 60 秒に余裕を持たせた値）
- リクエスト本文は Vercel の上限が 4.5MB。旧データの取り込みはプロジェクト単位で 4MB までにしている
- 集計は SQL Editor（postgres ロール）で `select * from idea_ws.funnel_daily;` / `select * from idea_ws.ai_fallback_daily;`
