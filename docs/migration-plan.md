# 移行計画（Phase 1〜9）

方針の要約は [CLAUDE.md](../CLAUDE.md)。各 Phase の冒頭で関連コードを読み直し、実装計画（変更・新規・削除ファイルとリスク）を提示して承認を得てから実装する。
「要確認」と書いた外部仕様は、その Phase の実装前に最新の公式ドキュメントで確認する。

## 現状コードの把握（Phase 0 時点）

| 項目 | 現状 | 移行で影響すること |
|---|---|---|
| サーバー | `server.ts`（Express + Vite middleware）。AI エンドポイント 2 本 + health | Phase 2 で FastAPI に移植、Phase 4 で削除 |
| AI | `server/gemini.ts` は `responseMimeType: json` のみ。失敗時は正規表現で `{...}` を救出 | Phase 2 で responseSchema に置き換え |
| フォールバック | PRD は `_fallbackNotice` を付けるが**フロントで表示していない**。整形（structure）はエラー時もフォールバックを無言で返す | Phase 2 で `usedFallback` / `fallbackReason` を両 API に追加し、UI に表示 |
| 入力検証 | 本文の有無だけ。上限なし（`jsonBodyLimit: 10mb`） | Phase 2 で件数・文字数上限を定数化し 422 |
| 矛盾検出 | プロンプトの出力例が `"contradictions": []` 固定のため実質出ない | Phase 8 |
| 既存 PRD 文脈 | 先頭 1000 文字で切り詰め（`EXISTING_PRD_CONTEXT_MAX_CHARS`） | Phase 8 |
| 永続化 | `LocalStorageWorkspaceRepository`（同期 API）。ID は `note-<timestamp>` 形式の文字列 | Phase 4 で Promise 化 + API 実装。DB は uuid なので**インポート時に ID を振り直す** |
| PRD 版管理 | `PrdDocument.versions` に埋め込み。保存のたびに旧版をスナップショット | `prd_versions` テーブルに分離。API では `versions` を含めて返す |
| サンプル | `src/config/seed.ts`（ユーザー・プロジェクト・4 セクション・5 メモ・PRD 1 件・新規プロジェクト用テンプレート・既定ペイン） | Phase 1 で seed SQL 化、Phase 4 で削除 |
| Supabase 関連 UI | `SupabaseGuideModal`、Header / Sidebar のボタン、`supabaseSchema.ts`（`auth.users` 前提の SQL） | 方針と矛盾するため Phase 4 で削除 |
| テスト | vitest: repository / prompts / fallbacks / utils | prompts・fallbacks は Phase 2 で pytest に移植 |
| ローカル環境 | システム Python は 3.9。Docker あり。Supabase CLI・psql なし | Python は uv で 3.12 を用意。DB は Docker |

---

## Phase 1：DB スキーマ（`idea_ws`）

**ブランチ**: `feature/phase1-db-schema`

### 新規ファイル
- `supabase/migrations/<timestamp>_idea_ws_schema.sql`：スキーマ・拡張（`citext`, `pgcrypto`）・全テーブル・インデックス・`updated_at` トリガー
- `supabase/migrations/<timestamp>_idea_ws_functions.sql`：`consume_quota(user_id, kind, limit)`、`consume_rate_limit(key, window_seconds, limit)`、掃除関数（`cleanup_inactive_guests(days)`, `cleanup_expired_auth()`）
- `supabase/migrations/<timestamp>_idea_ws_privileges.sql`：RLS 有効化、`anon` / `authenticated` からの REVOKE、`ALTER DEFAULT PRIVILEGES` での将来テーブルへの REVOKE、アプリ用ロールの GRANT
- `supabase/seed.sql`：`section_templates`、`sample_contents`（`seed.ts` の内容を jsonb 化。サンプル内の ID はキー名で持ち、複製時に uuid を振る）
- `docker-compose.yml`：ローカル Postgres（Supabase の Postgres イメージを第一候補。`anon` / `authenticated` ロールが存在する環境で検証するため。要確認）
- `backend/tests/db/test_privileges.py`：`SET ROLE anon` / `authenticated` で `idea_ws` の全テーブルが読めないこと、`consume_quota` の上限挙動、掃除関数、cascade 削除を確認
- `pyproject.toml`（最小構成: psycopg, pytest）、`docs/supabase-setup.md`（手作業チェックリスト）

### スキーマ設計の補足
- ユーザー配下テーブルにはすべて `user_id`（FK, cascade）を持たせ、子テーブルも冗長に `user_id` を持つ（認可クエリを単純にするため）。複合 FK `(project_id, user_id)` で親子の所有者一致を DB でも保証する。
- `prd_documents.source_note_ids` は uuid[] / jsonb（メモ削除後も参照履歴を残すため FK にしない）。
- `prd_versions` は `(prd_document_id, version_number)` unique。
- `workspace_preferences` は `(user_id, project_id)` unique。
- **IP 単位のレート制限用テーブル** `rate_limit_buckets(key, window_start, count)` と、上限判定つきでアトミックに加算する関数（例：`idea_ws.consume_rate_limit(key, window_seconds, limit) returns boolean`）を作る。`key` は `<エンドポイント種別>:<IP の HMAC ハッシュ>` とし、生の IP は保存しない。古いウィンドウは掃除関数で削除する。

### 完了条件
`docker compose up` した Postgres にマイグレーションと seed が通り、権限テストが pytest で通る。

---

## Phase 2：Python バックエンド（AI 機能の移植）

**ブランチ**: `feature/phase2-fastapi-ai`

- `backend/app/{main,config}.py`、`services/{prompts,fallbacks,gemini}.py`、`models/ai.py`、`routers/ai.py`
- `server/*.test.ts` を `backend/tests/test_{prompts,fallbacks}.py` に移植（期待値はそのまま）。ルーターのテストは Gemini をモックし、正常・スキーマ不一致・例外・キー未設定の 4 パターン。
- 構造化出力：`google-genai` の `response_schema` に pydantic モデルを渡す（要確認：現行 SDK の指定方法）。パース不能時のみ旧来の `{...}` 救出 → それも失敗したらフォールバック。
- レスポンスに `usedFallback: boolean` と `fallbackReason?: 'no_api_key' | 'ai_error' | 'invalid_response'` を追加（`src/config/api.ts` も更新）。フロントは PRD 生成・整形の両方でバナー表示。旧 `_fallbackNotice` は削除。
- 入力上限（例：notes ≤ 50 件、1 件 ≤ 20,000 文字、合計 ≤ 100,000 文字、整形本文 ≤ 20,000 文字）を `config.py` に定数化、超過は 422。フロントにも同じ値を持たせ事前に警告。
- `vite.config.ts` に `/api` → `http://localhost:8000` の proxy を追加し、`npm run dev:web` / `npm run dev:api` を追加。Express は残す。
- **リスク**：認証なしのため、この Phase のままデプロイしない（デプロイは Phase 6）。

---

## Phase 3：認証・セッション（ゲストのみ）

**ブランチ**: `feature/phase3-guest-session`

- `backend/app/{db,security}.py`、`routers/auth.py`（`POST /api/auth/guest`, `GET /api/auth/me`, `POST /api/auth/logout`）、`services/{turnstile,rate_limit,samples}.py`
- `db.py`：psycopg 3 の接続プール。Supavisor transaction mode 向けにプリペアドステートメントを無効化（`prepare_threshold=None`。要確認）。サーバーレスでのプール寿命も確認。
- `security.py`：`secrets.token_urlsafe(32)`、`HMAC-SHA256(pepper, token)` で保存、Cookie 発行（`HttpOnly; Secure; SameSite=Lax; Path=/`、ローカル http 時のみ Secure を外す設定）、`Origin` 検証の依存関数、`last_seen_at` は 10 分間隔でのみ更新。
- `Depends(current_user)` を AI エンドポイントに適用。`consume_quota` で日次上限（ゲスト / 登録で別の定数）。超過は 429 + `{ code: 'quota_exceeded', limit, registeredLimit, canUpgradeByRegistering }`。
- AI 呼び出しごとに `ai_generations` を記録（失敗・フォールバックも記録）。
- ゲスト作成時に `sample_contents` の有効版を 1 トランザクションで複製。
- `POST /api/auth/guest` に IP 単位のレート制限（`consume_rate_limit`）を適用。
- フロント：起動時に `/api/auth/me` → 401 なら Turnstile → `/api/auth/guest`。（Turnstile は `VITE_TURNSTILE_SITE_KEY`。ローカルは Cloudflare のテスト用キー。要確認）
- テスト：発行・検証・失効・期限切れ、Origin 不一致で 403、上限到達で 429、サンプル複製の件数と所有者。CI 用に Postgres を使う pytest fixture（テストごとにトランザクションをロールバック）。

---

## Phase 4：Workspace API とフロントのデータ層移行

**ブランチ**: `feature/phase4a-workspace-api`、`feature/phase4b-frontend-migration`

規模が大きいため **4a（API）と 4b（フロント移行・後片付け）の 2 PR に分ける**ことを提案（要承認）。

### 4a：API
- `routers/workspace.py`、`models/workspace.py`、`services/workspace_repo.py`（全関数が `user_id` 必須）
- `GET /api/workspace/bootstrap`（プロジェクト一覧 + 現在プロジェクトの sections / notes / prds / preferences を 1 往復で返す）
- projects / sections（並び替え含む）/ notes / prds（versions 含む・版の復元）/ preferences の CRUD
- `PATCH /api/notes/{id}`：`{ title?, content?, sectionId?, baseUpdatedAt }`。`updated_at` 不一致なら 409 + 最新値
- `GET /api/section-templates`、新規プロジェクトは `section_templates` から作成
- `POST /api/import/local`：旧 localStorage の JSON を受け取り、ID を uuid に振り直して取り込み（ペインの noteId、PRD の sourceNoteIds・facts.sourceNoteId も変換）
- テスト：別ユーザーの ID を指定すると 404（全リソース・全メソッド）、409 競合、インポートの ID 変換

### 4b：フロント移行と後片付け
- `IWorkspaceRepository` を Promise 化し `ApiWorkspaceRepository` を実装、`App.tsx` を非同期化（初回ローディング、エラー表示、`SaveStatus='error'` とリトライ）。デバウンスは維持し、楽観的更新 + 409 時の再取得。
- 旧 localStorage データ検出 → 確認ダイアログ → インポート → 成功後に削除
- 削除：`server.ts`, `server/`, `src/config/supabaseSchema.ts`, `src/config/seed.ts`, `src/config/storage.ts`（localStorage キーはインポート用に最小限残す）, `SupabaseGuideModal` とボタン, `express` / `@types/express` / `tsx` / `dotenv` / `@google/genai`
- `package.json` scripts を Vite + uvicorn 前提に更新。README に「2 ブラウザで別ゲストとしてデータが混ざらない確認手順」

---

## Phase 5：アカウント登録導線（任意登録）

**ブランチ**: `feature/phase5-signup`

- `routers/auth.py` に `POST /api/auth/email/start`、`GET /api/auth/email/callback`、`GET /api/auth/google/start`、`GET /api/auth/google/callback`
- `services/mailer.py`（`Mailer` プロトコル + `ResendMailer` + テスト用 `MemoryMailer`）、Google OAuth は Authorization Code + PKCE（`oauth_states` に state と verifier）。id_token の検証方法は要確認。
- 昇格：ゲストかつ identity 未登録 → 同じ users 行を `is_guest=false` に更新 + identity 追加 + セッション再発行
- 既存アカウント：ゲストにデータがあれば（サンプルとユーザー作成分を区別しない）「統合する / 破棄する」を確認。`POST /api/account/merge` は 1 トランザクションで user_id 付け替え → ゲスト削除。
- `routers/account.py`：表示名変更、ログアウト、アカウント削除（確認ダイアログ）
- 登録導線 UI：ヘッダー常設、初回 PRD 生成直後、メモ数が閾値超え、429 時。閉じたら一定期間非表示（設定は DB）。
- `routers/cron.py`：`Authorization: Bearer ${CRON_SECRET}` で保護し掃除関数を実行
- ログイン系の IP レート制限
- テスト：指示書の 4 シナリオ（メール / Google / 統合 / 削除）

---

## Phase 6：計測と Vercel デプロイ

**ブランチ**: `feature/phase6-analytics-deploy`

- `POST /api/events`（ホワイトリスト + properties のキーもイベント別に検証）、`src/services/analytics.ts`（失敗しても UI を止めない、`sendBeacon` 併用）
- ファネル・フォールバック率の SQL ビュー（`idea_ws` 内。Data API には出ない）
- `vercel.json` / エントリポイント：静的ビルド + FastAPI Function、SPA フォールバック、Cron（要確認：Vercel の FastAPI 対応・Python ランタイムのバージョン・関数サイズ上限・Cron のプラン制限）
- `docs/deploy.md`：環境変数一覧（Production / Preview / Development）
- `scripts/check-bundle-secrets.mjs`：`dist/` に `VITE_` 以外の環境変数値が含まれないことを検査（build 後に実行）
- `.github/workflows/ci.yml`：lint / vitest / pytest（Postgres サービスコンテナ）
- README 全面更新

---

## Phase 7：初回体験（Activation）

**ブランチ**: `feature/phase7-activation`

- 3 ステップのオンボーディング（スキップ可、表示済みフラグは `user_preferences` 的な列で DB 保存）
- 「貼るだけ PRD」入口：新規メモ作成 → 既存の PRD 生成を呼ぶ
- PRD 生成モーダル：推奨値を既定選択、詳細設定を折りたたみ、段階表示
- イベント追加

---

## Phase 8：AI 品質と「PRD を育てる」ループ

**ブランチ**: `feature/phase8-prd-loop`

- 矛盾検出：プロンプトに生成ルールと出力例、responseSchema に `notesInvolved`（メモ ID）を必須化。ビューアで強調・該当メモへジャンプ
- 再生成時の文脈：前回の facts / openQuestions / 見出し構成を構造化して渡す（全文切り詰めをやめる）
- 未決事項の回答欄 → 「決定事項」セクションのメモとして保存 → 回答を反映して新バージョン生成、版間差分（要件の追加・削除）表示
- イベント追加、プロンプトテスト更新

---

## Phase 9：拡散（共有リンク・Claude Code エクスポート）

**ブランチ**: `feature/phase9-share-export`

- `prd_documents` に `is_public`, `share_slug`（推測困難）, `allow_indexing`。公開ページは Python でサーバーレンダリング（OGP meta、既定 noindex、出典メモ本文は出さない、CTA）
- 動的 OGP 画像（ライブラリ・Vercel での実行可否は要確認）
- Claude Code エクスポート：`CLAUDE.md` / `docs/PRD.md` / `docs/tasks.md` を zip。未決事項は「実装前に人間に確認すること」と明記
- 非公開 PRD のスラッグは 404

---

## Phase 0 での決定事項

| # | 論点 | 決定 |
|---|---|---|
| 1 | アプリ用 DB ロールと RLS | 専用ロール `idea_ws_app` に `BYPASSRLS` を付与し、ポリシーは作らない。Supabase で付与できない場合は `TO idea_ws_app` 限定のポリシーに切り替える（Phase 1 で検証） |
| 2 | IP 単位のレート制限テーブル | Phase 1 で `rate_limit_buckets` と加算関数を追加。Phase 3 のゲスト作成、Phase 5 のメール送信・OAuth で使う |
| 3 | サンプル由来データの判定（`from_sample`） | 不要。統合確認はゲストにデータがあれば常に出す |
| 4 | Phase 4 の分割 | 4a（API）/ 4b（フロント移行・後片付け）の 2 PR に分ける |
| 5 | ローカル DB | Docker Compose で Supabase の Postgres イメージを使う（CI も同構成） |
| 6 | AI クォータの消費 | Gemini 呼び出し直前に消費。キー未設定時のフォールバックは消費しない。AI エラー時も返却しない |

## PR・マージ計画

### 原則
- 各 Phase のブランチは、**前の Phase の PR が `main` にマージされた後の `main` から切る**（積み上げブランチにしない。レビュー対象を 1 Phase 分に限定するため）。
- **すべての PR マージ時点で `main` が動く状態を保つ**。Express は 4b まで残し、それまでは `npm run dev` で従来どおり起動できる。
- マージ条件：CI（Phase 6 までは手元で）`npm run lint` / `npm test` / `uv run pytest` が通ること、Phase の完了条件を PR 本文で示すこと、レビュー承認。
- マージ方法は **Squash merge**（1 Phase = 1 コミットで履歴を読みやすく、問題があれば Phase 単位で revert できる）。
- **本番デプロイは Phase 6 のマージ後から**。それまで Vercel をリポジトリに接続しない（Phase 2〜5 の `main` には未完成の API があるため）。Phase 6 は先にプレビューデプロイで確認してからマージする。

### 順序と依存

| 順 | PR（ブランチ） | 前提 | マージ後の `main` の状態 |
|---|---|---|---|
| 0 | `feature/phase0-claude-md` | — | ドキュメントのみ。動作は変わらない |
| 1 | `feature/phase1-db-schema` | 0 | マイグレーション・seed・ローカル DB が追加。アプリ動作は変わらない |
| 2 | `feature/phase2-fastapi-ai` | 1 | FastAPI（AI のみ）が追加。Express と並存。Vite proxy で FastAPI 版も動かせる |
| 3 | `feature/phase3-guest-session` | 2 | ゲストセッション・クォータ付き AI。フロントは起動時にゲスト発行。データはまだ localStorage |
| 4a | `feature/phase4a-workspace-api` | 3 | Workspace API が追加（フロント未使用）。動作は 3 と同じ |
| 4b | `feature/phase4b-frontend-migration` | 4a | データが DB に移行。Express・seed.ts・Supabase ガイド削除。**ここで旧構成が消える** |
| 5 | `feature/phase5-signup` | 4b | メール / Google 登録・統合・アカウント削除・Cron |
| 6 | `feature/phase6-analytics-deploy` | 5 | 計測・CI・Vercel 設定。**マージ後に本番デプロイ開始** |
| 7 | `feature/phase7-activation` | 6 | オンボーディング・貼るだけ PRD |
| 8 | `feature/phase8-prd-loop` | 6 | 矛盾検出・回答ループ（7 と独立。7 の後に着手） |
| 9 | `feature/phase9-share-export` | 8 | 共有リンク・Claude Code エクスポート |

### 注意点
- **4b は戻しにくい**（localStorage → DB インポート後に localStorage を削除するため）。4b のマージ前に、旧データのあるブラウザでインポート → 確認 → 削除の流れを手動で確認し、PR 本文に手順を残す。
- **マイグレーションは追記のみ**。マージ済みのマイグレーションファイルは書き換えず、変更は新しいファイルで行う。
- Phase 6 で CI を入れるまでは、PR 本文にローカルで実行したコマンドと結果を貼る。
