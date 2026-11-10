# デプロイ手順（Vercel + Supabase）

構成: 1 つの Vercel プロジェクト（Framework Preset は **Vite**）。設定は [vercel.json](../vercel.json) だけ。

```
リクエスト ─┬─ /api/*   → rewrites → api/index.py（Vercel Function, Python 3.12）→ backend/app の FastAPI
            ├─ 静的ファイル（dist/assets など）→ Vercel の CDN
            └─ それ以外 → rewrites → /index.html（SPA の画面 URL を直接開いたとき）
```

- `api/index.py` は `backend.app.main` の `app` を公開するだけの入口。処理はすべて `backend/` に書く。`api/` に `.py` を増やすとそれぞれが別の Function になるので、増やさない（`__init__.py` も置かない）
- Python の依存は `pyproject.toml` + `uv.lock`、バージョンは `.python-version`（3.12）から Vercel が読む
- 画面のレスポンスヘッダー（CSP など）は `vercel.json` の `headers`、API のヘッダーは `main.py`。値は同じにする（`backend/tests/test_deploy.py` が CSP の一致を検証）
- DB は Supabase の Postgres（`scratch_prd` スキーマ）。本番で `DATABASE_URL` が未設定なら API は起動しない
- 参考: [Python runtime](https://vercel.com/docs/functions/runtimes/python) / [api ディレクトリ](https://vercel.com/docs/functions/runtimes/python/api-directory) / [vercel.json](https://vercel.com/docs/project-configuration/vercel-json) / [Cron jobs](https://vercel.com/docs/cron-jobs)
- ⚠️ ルートの `pyproject.toml` に FastAPI があるため、Framework Preset が FastAPI と自動判定されると `api/` が Function にならない（公式ドキュメント: Python のフレームワークプリセットが `api/` より優先される）。`vercel.json` の `"framework": "vite"` で Vite に固定している。Project Settings 側でも Vite になっていることを確認する

ローカルの `vercel build`（CLI 65.11.0）で、`api/index.func`（python3.12・maxDuration 90）が作られ、`backend/` が含まれ `dist/`・`node_modules/` が含まれないこと、ルートが上の図のとおりになることを確認済み。

## 環境の分け方

| 環境 | Vercel | DB |
|---|---|---|
| Production | `main` ブランチ | 本番用の Supabase プロジェクト |
| Development | ローカル（`docker compose up` または `npm run dev`） | docker compose の Postgres |

プレビュー環境は使わない。PR の動作確認はローカルの docker compose で行う（README の「開発フロー」）。

## 環境変数

Vercel の Project Settings → Environment Variables で、環境ごとに設定する。`VITE_` で始まる値はビルド時にフロントへ埋め込まれる（公開値のみ）。

| 変数 | Production | Development（`.env`） | 説明 |
|---|---|---|---|
| `DATABASE_URL` | Supabase の Connect 画面の Transaction pooler の接続文字列（ユーザー `postgres.<project-ref>`） | `postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres` | バックエンドの接続先（[supabase-setup.md](supabase-setup.md) §4） |
| `DATABASE_URL_DIRECT` | **設定しない** | ローカルの直接接続 | マイグレーション・メンテナンス SQL 専用（手元から psql で流すときだけ使う） |
| `SESSION_TOKEN_PEPPER` | 32 文字以上のランダムな文字列 | `.env.example` の値 | トークン・IP の HMAC 鍵。変えると全セッションが無効になる |
| `ALLOWED_ORIGINS` | 本番ドメイン（例 `https://idea-workspace.example.com`） | `http://localhost:3000` | 状態を変える API を許可する Origin（カンマ区切り）。Vercel のデプロイ URL（`VERCEL_URL` など）は自動で追加される |
| `COOKIE_SECURE` | `true` | `false` | `true` で Cookie 名が `__Host-iws_session` になり HSTS を付ける |
| `TRUST_PROXY_HEADERS` | `true` | `false` | `x-forwarded-for` を信頼する（Vercel が上書きするため） |
| `CRON_SECRET` | 16 文字以上のランダム文字列 | 任意 | `GET /api/cron/cleanup` の認証 |
| `GEMINI_API_KEY` | 任意 | 任意 | 未設定なら内蔵ジェネレータで応答（`usedFallback: true`） |
| `GEMINI_MODEL` | 任意（既定 `gemini-3.8-flash`） | 任意 | |

> Production（Vercel が `VERCEL_ENV=production` を設定する）では、次のどれかに当てはまると API が起動しない（ローカル用の設定のまま本番に出さないため）。
> `DATABASE_URL` が未設定かローカル（localhost / db）・`SESSION_TOKEN_PEPPER` が 32 文字未満・`COOKIE_SECURE` / `TRUST_PROXY_HEADERS` が `true` でない・`CRON_SECRET` が 16 文字未満。

ランダムな値の作り方:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> 指示書にあった `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `RESEND_API_KEY` / `MAIL_FROM` / `APP_BASE_URL` は、メール送信・Google ログインを保留しているため不要（[migration-plan.md](migration-plan.md) Phase 5 の保留事項）。

## 初回セットアップ チェックリスト

### Supabase（本番の 1 プロジェクト）
- [ ] [supabase-setup.md](supabase-setup.md) の手順を行う（マイグレーション・seed・Data API に `scratch_prd` を出さない）
- [ ] `DATABASE_URL`（Connect 画面の Transaction pooler の接続文字列、ユーザー `postgres.<project-ref>`）を控える

### Vercel
- [ ] GitHub リポジトリを Import する。Framework Preset は **Vite**（`vercel.json` の `"framework": "vite"`）。Build Command / Output Directory も `vercel.json` の値（`npm run build && npm run check:bundle` / `dist`）が使われる
- [ ] Node.js のバージョンを 24.x にする（Project Settings → Build and Deployment）
- [ ] 上の表のとおり環境変数を Production に設定する
- [ ] プレビューデプロイを使わないため、Preview 環境には環境変数を設定しない
- [ ] 本番ドメインを設定し、`ALLOWED_ORIGINS` に入れる

## 本番デプロイ後の確認

マージ前の確認はローカルの docker compose で済ませておく（README の「開発フロー」）。ここでは本番でしか確認できないこと（ビルド、https の Cookie・ヘッダー、Cron）も含めて確認する。

1. ビルドログで次を確認する
   - `npm ci && npm run build && npm run check:bundle` が成功し、「秘密情報の検査: 問題なし」が出ている
   - Python の依存が `pyproject.toml` / `uv.lock` からインストールされている
   - Functions に `api/index` があり、Runtime が Python 3.12 になっている
2. `https://<デプロイ URL>/api/health` が `{"status":"ok",...}` を返す
3. 画面を開き、ゲストとして始まる（サンプルのプロジェクトが出る）
4. メモを作成・編集し、再読み込みしても残っている
5. PRD を生成できる（`GEMINI_API_KEY` が無ければ「内蔵ジェネレータで作成しました」と表示される）
6. 「登録してデータを保護」からメールアドレス + パスワードで登録できる。別のブラウザでログインして同じデータが見える
7. 画面の URL（例 `/projects/xxx`）を直接開いても画面が出る。存在しない `/api/...` は 404 になる
8. レスポンスヘッダーに `Content-Security-Policy`・`Strict-Transport-Security` が付いている
9. Vercel の Cron Jobs タブで `/api/cron/cleanup` が登録されている。手動で確認する場合:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<本番ドメイン>/api/cron/cleanup
```

## ローカルで `vercel dev` を使う場合（参考）

```bash
VERCEL_TELEMETRY_DISABLED=1 npx vercel@65.11.0 dev --local --listen 3000
```

- `--local` ではプロジェクトにリンクせず、環境変数は `.env` から読む（シェルの環境変数は Python に渡らない）。`.env` の `ALLOWED_ORIGINS` に合わせて `--listen 3000` で起動する
- 確認済み（CLI 65.11.0、`api/` 構成）: `/api/health` が FastAPI に元のパスのまま届く、存在しない `/api/...` は FastAPI の 404、Origin の検査（403）、画面に CSP などのヘッダー
- ⚠️ CLI 65.11.0 の `vercel dev` は `functions` の `maxDuration` があると「must not contain `maxDuration`」で Function を起動しない（`vercel build` とデプロイでは問題ない）。確かめるときだけ一時的に外す
- ⚠️ `vercel dev` はローカルの `python3` で Function を動かす。macOS の標準（3.9）だと起動しないので、PATH の先頭に 3.12 の `python3` を置く（`uv python find --no-project 3.12`）
- ⚠️ 既知の問題: CLI 64.0.2 / 65.3.1 の `--local` モードでは、ブラウザから同時に複数のリクエストが来ると CLI が Python の開発サーバーを停止し、その後のリクエストが `FUNCTION_INVOCATION_FAILED`（500）になる（ログに `ECONNREFUSED`）。1 件ずつのリクエストでは動く。アプリ側の問題ではないため、日常の開発と PR の確認は docker compose（または `npm run dev`）で行う

## 運用メモ

- Cron は Hobby プランでは 1 日 1 回（`0 18 * * *` = JST 3 時台のどこか）。失敗しても再試行されないが、掃除処理は何度実行しても安全
- 関数の実行時間は `vercel.json` の `maxDuration: 90`（Gemini のタイムアウト 60 秒に余裕を持たせた値）
- リクエスト本文は Vercel の上限が 4.5MB。旧データの取り込みはプロジェクト単位で 4MB までにしている
- 集計は SQL Editor（postgres ロール）で `select * from scratch_prd.funnel_daily;` / `select * from scratch_prd.ai_fallback_daily;`
