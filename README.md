# Idea Workspace

思いつきを逃さず、断片的な思考を開発・検証できる PRD へと育てる個人向けプロダクト開発ワークスペース。

## セットアップ

前提: Node.js

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY を設定（未設定でも内蔵ジェネレータで動作）
npm run dev            # http://localhost:3000
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` / `npm start` | Express + Vite ミドルウェアで起動（`NODE_ENV=production` なら `dist/` を配信） |
| `npm run build` | フロントエンドを `dist/` にビルド |
| `npm run lint` | 型チェック |

## ディレクトリ構成

```
server.ts               Express エントリ（API ルーティング・静的配信）
server/
  config.ts             サーバー設定（ポート・Gemini モデル・各種上限値）
  gemini.ts             Gemini クライアントと JSON 応答のパース
  prompts.ts            AI へのプロンプト
  fallbacks.ts          API キー未設定・AI エラー時の内蔵ジェネレータ
src/
  config/               定数・定義ファイル
    app.ts              アプリ全体（表示名・タイミング・ペイン・ショートカット）
    api.ts              API エンドポイントとリクエスト/レスポンス型（サーバーと共有）
    prd.ts              PRD 生成モード・詳細度などのラベルと配色（サーバーと共有）
    storage.ts          localStorage キー・ID プレフィックス
    seed.ts             初回起動時のサンプルデータ・新規作成時のデフォルト
    supabaseSchema.ts   Supabase 移行用 SQL
  services/
    workspaceRepository.ts  データ永続化（現在は localStorage 実装）
    apiClient.ts            サーバー API 呼び出し
  hooks/                共通フック
  utils/                Markdown レンダラ・メモ表示名ヘルパー
  components/           UI コンポーネント
```

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `GEMINI_API_KEY` | なし | 未設定時は内蔵ジェネレータで応答 |
| `GEMINI_MODEL` | `gemini-3.8-flash` | 使用する Gemini モデル |
| `PORT` | `3000` | サーバーのポート |
