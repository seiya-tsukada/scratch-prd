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
- DB は Supabase の Postgres（`idea_ws` スキーマ）。準備できるまでは下の「モックでのデプロイ」
- 参考: [Python runtime](https://vercel.com/docs/functions/runtimes/python) / [api ディレクトリ](https://vercel.com/docs/functions/runtimes/python/api-directory) / [vercel.json](https://vercel.com/docs/project-configuration/vercel-json) / [Cron jobs](https://vercel.com/docs/cron-jobs)
- ⚠️ ルートの `pyproject.toml` に FastAPI があるため、Framework Preset が FastAPI と自動判定されると `api/` が Function にならない（公式ドキュメント: Python のフレームワークプリセットが `api/` より優先される）。`vercel.json` の `"framework": "vite"` で Vite に固定している。Project Settings 側でも Vite になっていることを確認する

ローカルの `vercel build`（CLI 65.11.0）で、`api/index.func`（python3.12・maxDuration 90）が作られ、`backend/` と `mock/fixture.json` が含まれ `dist/`・`node_modules/` が含まれないこと、ルートが上の図のとおりになることを確認済み。

## モックでのデプロイ（Supabase を用意するまでの一時的な構成）

API が DB に接続せず `backend/app/mock/` の固定サンプルを返すモード。Supabase・Turnstile・Resend（メール送信は未実装）が無くてもデプロイして画面を確認できる。

**環境変数を何も設定しなくてよい。** Vercel 上（Vercel が自動で設定する `VERCEL_ENV` がある）で `DATABASE_URL` が無ければ、自動でモックになる（`config.Settings.use_mock`。`check:bundle` も同じ規則）。

| `MOCK_BACKEND` | `DATABASE_URL` | 動作 |
|---|---|---|
| 未設定 | 未設定 | Vercel 上ならモック。ローカルは `localhost:54322` の DB に接続 |
| 未設定 | あり | DB を使う（本番では下の設定検査が有効） |
| `true` | 問わない | モック |
| `false` | 問わない | DB を使う（自動切り替えを止める。`DATABASE_URL` が無ければローカルの DB） |

- ログイン中ユーザーは常に同じゲスト、プロジェクトはサンプル 1 件（初回の案内は済み扱い）
- PRD 生成は内蔵ジェネレータで応答する（「内蔵ジェネレータで作成しました」と表示される）
- 保存・変更（メモの作成・編集、登録・ログインなど）は 503 `mock_mode` になり、画面に「デモ環境のため保存できません」と出る
- 本番用の設定検査（`config.Settings`）と `check:bundle` の Turnstile サイトキーの検査は行わない。`SESSION_TOKEN_PEPPER` も不要
- 起動時に Function のログへ `MOCK mode: ...` の警告を出す

手順: GitHub リポジトリを Vercel に Import → Node.js を 24.x にする → `main` をデプロイ → `https://<デプロイ URL>/api/health` が `"mode":"mock"` を返すことを確認する。

> ⚠️ Supabase 接続後に `DATABASE_URL` を消すと、エラーにならずモックに切り替わる（データは見えなくなるが漏れはしない）。Supabase 接続時に `MOCK_BACKEND=false` も設定しておくと、`DATABASE_URL` が無いときに起動時エラーで気付ける。

ローカルで同じ状態を確認する場合（`npm run build` 済み）:

```bash
VERCEL_ENV=production MOCK_BACKEND=true COOKIE_SECURE=false ALLOWED_ORIGINS=http://localhost:8010 uv run uvicorn backend.app.main:app --port 8010
```

Supabase に切り替えるときは、下の「環境変数」の表どおりに設定し（`MOCK_BACKEND=false` を推奨）、`backend/app/mock/` と `main.py` / `config.py` / `scripts/check-bundle-secrets.mjs` / `src/services/apiClient.ts`（`mock_mode`）のモック分岐を削除する。

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
| `DATABASE_URL` | 本番 DB の Transaction pooler（ユーザー `idea_ws_app.<project-ref>`） | `postgresql://idea_ws_app:idea_ws_app@localhost:54322/postgres` | バックエンドの接続先（[supabase-setup.md](supabase-setup.md) §5） |
| `DATABASE_URL_DIRECT` | **設定しない** | ローカルの直接接続 | マイグレーション・メンテナンス SQL 専用（手元から psql で流すときだけ使う） |
| `SESSION_TOKEN_PEPPER` | 32 文字以上のランダムな文字列 | `.env.example` の値 | トークン・IP の HMAC 鍵。変えると全セッションが無効になる |
| `ALLOWED_ORIGINS` | 本番ドメイン（例 `https://idea-workspace.example.com`） | `http://localhost:3000` | 状態を変える API を許可する Origin（カンマ区切り）。Vercel のデプロイ URL（`VERCEL_URL` など）は自動で追加される |
| `COOKIE_SECURE` | `true` | `false` | `true` で Cookie 名が `__Host-iws_session` になり HSTS を付ける |
| `TRUST_PROXY_HEADERS` | `true` | `false` | `x-forwarded-for` を信頼する（Vercel が上書きするため） |
| `TURNSTILE_SECRET_KEY` | 本番ウィジェットの秘密鍵 | テスト用キー `1x0000000000000000000000000000000AA` | ゲスト作成時の bot 対策 |
| `VITE_TURNSTILE_SITE_KEY` | 本番ウィジェットのサイトキー | テスト用キー `1x00000000000000000000AA` | ビルド時に埋め込まれる公開値 |
| `CRON_SECRET` | 16 文字以上のランダム文字列 | 任意 | `GET /api/cron/cleanup` の認証 |
| `GEMINI_API_KEY` | 任意 | 任意 | 未設定なら内蔵ジェネレータで応答（`usedFallback: true`） |
| `GEMINI_MODEL` | 任意（既定 `gemini-3.8-flash`） | 任意 | |
| `MOCK_BACKEND` | Supabase 接続後は `false`（推奨） | 不要 | 未設定なら Vercel 上で `DATABASE_URL` が無いときモック。`true` / `false` で固定（上の「モックでのデプロイ」） |

> Production（Vercel が `VERCEL_ENV=production` を設定する）では、次のどれかに当てはまると API が起動しない（ローカル用の設定のまま本番に出さないため）。
> `DATABASE_URL` がローカル（localhost / db）・`SESSION_TOKEN_PEPPER` が 32 文字未満・`TURNSTILE_SECRET_KEY` が未設定かテスト用・`COOKIE_SECURE` / `TRUST_PROXY_HEADERS` が `true` でない・`CRON_SECRET` が 16 文字未満。
> ビルドでも `VITE_TURNSTILE_SITE_KEY` が未設定かテスト用なら `check:bundle` が失敗する。

ランダムな値の作り方:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> 指示書にあった `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `RESEND_API_KEY` / `MAIL_FROM` / `APP_BASE_URL` は、メール送信・Google ログインを保留しているため不要（[migration-plan.md](migration-plan.md) Phase 5 の保留事項）。

## 初回セットアップ チェックリスト

### Supabase（本番の 1 プロジェクト）
- [ ] [supabase-setup.md](supabase-setup.md) の手順を行う（マイグレーション・seed・`idea_ws_app` のパスワード・Data API に `idea_ws` を出さない）
- [ ] `DATABASE_URL`（Transaction pooler、ユーザー `idea_ws_app.<project-ref>`）を控える

### Cloudflare Turnstile
- [ ] ウィジェットを作成し、サイトキーと秘密鍵を控える
- [ ] 許可するホスト名に本番ドメインを追加する

### Vercel
- [ ] GitHub リポジトリを Import する。Framework Preset は **Vite**（`vercel.json` の `"framework": "vite"`）。Build Command / Output Directory も `vercel.json` の値（`npm run build && npm run check:bundle` / `dist`）が使われる
- [ ] Node.js のバージョンを 24.x にする（Project Settings → Build and Deployment）
- [ ] 上の表のとおり環境変数を Production に設定する
- [ ] プレビューデプロイを使わないため、Preview 環境には環境変数を設定しない
- [ ] 本番ドメインを設定し、`ALLOWED_ORIGINS` に入れる

## 本番デプロイ後の確認

マージ前の確認はローカルの docker compose で済ませておく（README の「開発フロー」）。ここでは本番でしか確認できないこと（ビルド、Turnstile の本番キー、https の Cookie・ヘッダー、Cron）も含めて確認する。

1. ビルドログで次を確認する
   - `npm ci && npm run build && npm run check:bundle` が成功し、「秘密情報の検査: 問題なし」が出ている
   - Python の依存が `pyproject.toml` / `uv.lock` からインストールされている
   - Functions に `api/index` があり、Runtime が Python 3.12 になっている
2. `https://<デプロイ URL>/api/health` が `{"status":"ok",...}` を返す
3. 画面を開き、ゲストとして始まる（Turnstile が表示され、サンプルのプロジェクトが出る）
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
- 集計は SQL Editor（postgres ロール）で `select * from idea_ws.funnel_daily;` / `select * from idea_ws.ai_fallback_daily;`
