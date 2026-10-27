# Idea Workspace

思いつきを逃さず、断片的な思考を開発・検証できる PRD へと育てる個人向けプロダクト開発ワークスペース。

構成: Vite（React）+ FastAPI（Python）+ Supabase Postgres（`idea_ws` スキーマ、自前のゲストセッション）。
詳しい方針は [CLAUDE.md](CLAUDE.md)、移行計画は [docs/migration-plan.md](docs/migration-plan.md)。
（README の全面更新は Phase 6 で行う）

## セットアップ

前提: Node.js、[uv](https://docs.astral.sh/uv/)、Docker（colima 等）

```bash
npm install
uv sync
cp .env.example .env                        # ローカル用の値入り。GEMINI_API_KEY は任意
docker compose up -d                        # ローカル Postgres（開発用 :54322 / テスト用 :54323）
uv run python -m backend.scripts.db_reset   # 開発用 DB にマイグレーションとサンプルを適用
npm run dev                                 # http://localhost:3000（FastAPI :8000 と Vite を同時起動）
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | FastAPI と Vite を同時起動（`/api` は Vite が :8000 へ転送） |
| `npm run build` | フロントエンドを `dist/` にビルド |
| `npm run lint` / `npm test` | 型チェック / vitest |
| `uv run pytest` | バックエンドのテスト（テスト用 DB を作り直して実行） |

## 2 つのブラウザでデータが混ざらないことの確認

データはブラウザごとのゲストユーザー（Cookie のセッション）に紐づく。次の手順で、別のゲスト同士のデータが混ざらないことを確認できる。
（自動テストでは `backend/tests/test_workspace_isolation.py` が全 API について同じことを検証している）

1. `npm run dev` で起動する。
2. ブラウザ A（通常ウィンドウ）で http://localhost:3000 を開く。サンプルのプロジェクトが表示される。
3. ブラウザ A でメモを 1 件作り、「ブラウザ A のメモ」と入力する。ヘッダーの表示が「自動保存完了」になるのを待つ。
4. ブラウザ B（別のブラウザ、または A のシークレットウィンドウ）で http://localhost:3000 を開く。
5. ブラウザ B にはサンプルだけが表示され、「ブラウザ A のメモ」が無いことを確認する。
6. ブラウザ B でメモを作り「ブラウザ B のメモ」と入力する。
7. ブラウザ A を再読み込みし、「ブラウザ A のメモ」が残っていて「ブラウザ B のメモ」が無いことを確認する。
8. （任意）DB で 2 人のゲストができていることを確認する:
   `docker compose exec db psql -U postgres -c "select id, is_guest, created_at from idea_ws.users"`

## 以前のバージョンのデータ

以前のバージョンはデータをブラウザの localStorage に保存していた。そのデータが残っているブラウザで開くと、
取り込むかどうかを確認するダイアログが表示される。取り込んだプロジェクトの分は localStorage から削除される。
