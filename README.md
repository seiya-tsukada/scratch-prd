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

前提: Node.js 24 以降、[uv](https://docs.astral.sh/uv/)、Docker（colima 等）

```bash
npm install
uv sync
cp .env.example .env                        # ローカル用の値入り。GEMINI_API_KEY は任意
docker compose up -d                        # Postgres（開発用 :54322 / テスト用 :54323）
uv run python -m backend.scripts.db_reset   # 開発用 DB にマイグレーションとサンプルを適用
npm run dev                                 # http://localhost:3000（FastAPI :8000 と Vite を同時起動）
```

Turnstile はローカルでは Cloudflare 公式のテストキー（常に成功）を使う。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | FastAPI と Vite を同時起動（`/api` は Vite が :8000 へ転送） |
| `npm run lint` / `npm test` | 型チェック / vitest |
| `npm run build` / `npm run check:bundle` | フロントのビルド / ビルド成果物に秘密情報が無いことの検査 |
| `uv run pytest` | バックエンドのテスト（テスト用 DB を作り直して実行） |
| `uv run ruff check backend && uv run mypy` | Python の lint / 型チェック |

GitHub Actions（[.github/workflows/ci.yml](.github/workflows/ci.yml)）が PR ごとに上記をすべて実行する。

## デプロイ

[docs/deploy.md](docs/deploy.md)（環境変数・初回セットアップ・デプロイ後の確認）と [docs/supabase-setup.md](docs/supabase-setup.md)（Supabase の手作業）を参照。

## 2 つのブラウザでデータが混ざらないことの確認

データはブラウザごとのゲストユーザー（Cookie のセッション）に紐づく。次の手順で確認できる。
（自動テストでは `backend/tests/test_workspace_isolation.py` が全 API について同じことを検証している）

1. `npm run dev` で起動する。
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
