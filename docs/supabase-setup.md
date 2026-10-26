# Supabase セットアップ チェックリスト

Supabase は **マネージド Postgres としてのみ**使う（Supabase Auth・Data API・Storage は使わない）。
ダッシュボードでの手作業をここにまとめる。完了したら `[x]` にする。

## 1. プロジェクト作成

- [ ] Supabase でプロジェクトを作成する（リージョンは Vercel の Function と近い場所。例: 東京 `ap-northeast-1`）
- [ ] データベースのパスワード（`postgres` ロール）をパスワードマネージャーに保存する
- [ ] Project ref（`https://<project-ref>.supabase.co` の `<project-ref>`）を控える

## 2. Data API に idea_ws を公開しない

- [ ] Project Settings → Data API → **Exposed schemas に `idea_ws` が含まれていない**ことを確認する（追加しない）
- [ ] 本サービスでは Data API を使わないため、可能なら Data API 自体を無効にする（他用途で使っていない場合）

> 公開されていなくても、`idea_ws` は anon / authenticated / service_role から REVOKE 済みで、RLS も有効（anon / authenticated 向けのポリシーなし）。二重の防御になっている。

## 3. マイグレーションと seed の適用

[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) を使う。接続は**直接接続**（プーラーではない）で、`postgres` ロールで行う。

```bash
# 直接接続の文字列: Project の Connect → Direct connection
export DATABASE_URL_DIRECT='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres'

supabase db push --db-url "$DATABASE_URL_DIRECT" --dry-run   # 適用されるマイグレーションを確認
supabase db push --db-url "$DATABASE_URL_DIRECT"
psql "$DATABASE_URL_DIRECT" -f supabase/seed.sql              # 初回のみ（何度実行しても重複しない）
```

- [ ] 適用前に CLI の最新ドキュメントで `db push` のオプション（`--db-url`, `--include-seed` など）を確認する
- [ ] `--dry-run` で 3 つのマイグレーションが対象になっていることを確認してから適用する
- [ ] seed を適用する
- [ ] 直接接続が IPv6 のみで繋がらない場合は、Connect 画面の Session pooler（ポート 5432）の接続文字列を使う

## 4. アプリ用ロール `idea_ws_app` のパスワード設定

マイグレーションは `idea_ws_app` を**ログイン不可**で作る（パスワードを git に入れないため）。本番では SQL Editor で次を実行する。

```sql
alter role idea_ws_app with login password '<十分に長いランダム文字列>';
```

- [ ] 上記を実行し、パスワードをパスワードマネージャーに保存する
- [ ] `idea_ws_app` が BYPASSRLS / superuser を持たないことを確認する:
      `select rolsuper, rolbypassrls from pg_roles where rolname = 'idea_ws_app';` → `f, f`

## 5. 接続文字列（Phase 3 以降でバックエンドが使う）

| 用途 | 環境変数 | 接続先 | ユーザー |
|---|---|---|---|
| バックエンド（Vercel Function） | `DATABASE_URL` | **Transaction pooler**（Supavisor, ポート 6543） | `idea_ws_app.<project-ref>` |
| マイグレーション | `DATABASE_URL_DIRECT` | Direct connection（ポート 5432） | `postgres` |

```
DATABASE_URL=postgresql://idea_ws_app.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

- [ ] Connect 画面の Transaction pooler の文字列を基に、ユーザー名を `idea_ws_app.<project-ref>` に置き換えた `DATABASE_URL` を作る
- [ ] 次の確認クエリが動くこと（`idea_ws_app` でプーラー経由に接続できること）を確かめる:

```bash
psql "$DATABASE_URL" -c "select count(*) from idea_ws.section_templates"   # → 4
psql "$DATABASE_URL" -c "select current_setting('search_path')"            # → idea_ws, extensions
```

- [ ] anon からは読めないことを確認する（SQL Editor で実行）:

```sql
set role anon;
select * from idea_ws.users;   -- permission denied for schema idea_ws になること
reset role;
```

> Transaction pooler ではプリペアドステートメントが使えない。psycopg では `prepare_threshold=None` を指定する（Phase 3 の接続管理で対応）。
> 参考: <https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL>

## 6. コンテンツの更新（デプロイ不要）

サンプルやセクションテンプレートは SQL Editor（`postgres` ロール）で更新する。`idea_ws_app` には読み取り権限しかない。

- セクションテンプレート: `idea_ws.section_templates` の `name` / `icon` / `position` / `is_active` を編集する
- サンプル: 新しい `version` の行を `is_active = false` で追加 → 既存の有効行を `false` にしてから新しい行を `true` にする（有効な行は 1 件まで）
- `sample_contents.content` の形式は `supabase/seed.sql` 先頭のコメントを参照

## 7. 運用メモ

- マイグレーションは**追記のみ**。マージ済みのファイルは書き換えない
- テーブルを追加するマイグレーションでは、RLS 有効化・`idea_ws_app` への GRANT・`idea_ws_app` 用ポリシーを同じファイルで行う（`backend/tests/db/test_privileges.py` が検出する）
- ローカルでは `postgres` ロールで BYPASSRLS 付きロールを作れるが、Supabase 本番ではできない前提で設計している（ポリシー方式）
