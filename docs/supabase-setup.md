# Supabase セットアップ チェックリスト

Supabase は **マネージド Postgres としてのみ**使う（Supabase Auth・Data API・Storage は使わない）。
ダッシュボードでの手作業をここにまとめる。完了したら `[x]` にする。

## 1. プロジェクト作成

- [ ] Supabase でプロジェクトを作成する（リージョンは Vercel の Function と近い場所。例: 東京 `ap-northeast-1`）
- [ ] データベースのパスワード（`postgres` ロール）をパスワードマネージャーに保存する
- [ ] Project ref（`https://<project-ref>.supabase.co` の `<project-ref>`）を控える

## 2. Data API に scratch_prd を公開しない

- [ ] Project Settings → Data API → **Exposed schemas に `scratch_prd` が含まれていない**ことを確認する（追加しない）
- [ ] 本サービスでは Data API を使わないため、可能なら Data API 自体を無効にする（他用途で使っていない場合）

> 公開されていなくても、`scratch_prd` は anon / authenticated / service_role から REVOKE 済みで、RLS も有効（anon / authenticated 向けのポリシーなし）。二重の防御になっている。

## 3. マイグレーションと seed の適用

`psql` で `supabase/migrations/*.sql`（名前順）と seed を流す。Supabase CLI の `supabase db push` は使わない（日付入りのファイル名を前提とし、適用履歴で管理するため）。
マイグレーションは**冪等**（既にあるものは作らない）なので、デプロイのたびに全ファイルを流してよい。接続は**直接接続**（プーラーではない）で、`postgres` ロールで行う。

```bash
# 直接接続の文字列: Project の Connect → Direct connection
export DATABASE_URL_DIRECT='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres'

cat supabase/migrations/*.sql supabase/seed.sql | psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -1
```

- [ ] マイグレーションと seed を適用する（`-1` で 1 トランザクション。途中で失敗したら何も変わらない）
- [ ] `psql "$DATABASE_URL_DIRECT" -f supabase/maintenance/row_counts.sql` でテーブルができていることを確認する
- [ ] 直接接続が IPv6 のみで繋がらない場合は、Connect 画面の Session pooler（ポート 5432）の接続文字列を使う

## 4. 接続文字列（バックエンドが使う）

| 用途 | 環境変数 | 接続先 | ユーザー |
|---|---|---|---|
| バックエンド（Vercel Function） | `DATABASE_URL` | **Transaction pooler**（Supavisor, ポート 6543） | `postgres.<project-ref>` |
| マイグレーション | `DATABASE_URL_DIRECT` | Direct connection（ポート 5432） | `postgres` |

Project の **Connect → Transaction pooler** に出てくる接続文字列を、`[YOUR-PASSWORD]` を 1. のパスワードに置き換えてそのまま `DATABASE_URL` に設定する。

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

- [ ] Connect 画面の Transaction pooler の文字列で `DATABASE_URL` を作る（パスワードに記号があれば URL エンコードする）
- [ ] 次の確認クエリが動くことを確かめる:

```bash
psql "$DATABASE_URL" -c "select count(*) from scratch_prd.sample_contents"     # → 1
```

- [ ] anon からは読めないことを確認する（SQL Editor で実行）:

```sql
set role anon;
select * from scratch_prd.users;   -- permission denied for schema scratch_prd になること
reset role;
```

> バックエンドは `postgres` ロール（テーブルの所有者）で接続するため、本番では RLS のポリシーは効かない。認可はバックエンドの `user_id` 条件で守る。
> RLS と anon / authenticated からの REVOKE は、Data API など**バックエンド以外の経路**からデータを守るために残している。
> アプリ用ロール `idea_ws_app` はローカル・テストの接続にだけ使う（本番ではログイン不可のまま。パスワード設定は不要）。

> Transaction pooler ではプリペアドステートメントが使えない。psycopg では `prepare_threshold=None` を指定する（Phase 3 の接続管理で対応）。
> 参考: <https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL>

## 5. コンテンツの更新（デプロイ不要）

サンプルは SQL Editor（`postgres` ロール）で更新する。

- サンプル: 新しい `version` の行を `is_active = false` で追加 → 既存の有効行を `false` にしてから新しい行を `true` にする（有効な行は 1 件まで）
- `sample_contents.content` の形式は `supabase/seed.sql` 先頭のコメントを参照

## 6. 運用メモ

- マイグレーションは**冪等**に書く（`create table if not exists`、`create index if not exists`、`create or replace function / view / trigger`、`pg_constraint` などを見る `do` ブロック）。既存の DB にもう一度流しても壊れないこと（`backend/tests/db/test_migrations.py` が 2 回適用を検証する）
- ファイル名に日付を入れない（例 `init.sql`）。名前順に流すので、新しいファイルは既存のファイルより後ろに来る名前にする
- 手動の運用作業（行数の確認・期限切れの掃除・ユーザー削除・データの全削除など）は `supabase/maintenance/` の SQL を使う（README の「メンテナンス用 SQL」）
- テーブルを追加するマイグレーションでは、RLS 有効化・`idea_ws_app` への GRANT・`idea_ws_app` 用ポリシーを同じファイルで行う（`backend/tests/db/test_privileges.py` が検出する）
- ローカルでは `postgres` ロールで BYPASSRLS 付きロールを作れるが、Supabase 本番ではできない前提で設計している（ポリシー方式）
