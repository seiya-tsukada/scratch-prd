-- ========================================================
-- メールの確認コード（登録・ログインの 2 段階目）
--   * token_hash: 画面に渡す確認 ID（乱数）のハッシュ。コードはこの ID と組でないと使えない
--   * code_hash: 確認 ID と組にしたコードのハッシュ（backend/app/security.py の hash_email_code）。平文は保存しない
--   * password_hash: 登録のときだけ、確認が済むまで新しいパスワード（Argon2id）を預かる
--   * attempts: 入力された回数（正解を含む）。上限を超えたらそのコードは使えない
-- ========================================================

create table if not exists scratch_prd.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('register', 'login')),
  -- register: 昇格させるゲスト / login: ログインするアカウント
  user_id uuid not null references scratch_prd.users (id) on delete cascade,
  email extensions.citext not null,
  token_hash bytea not null unique,
  code_hash bytea not null,
  password_hash text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  constraint email_verification_codes_register_has_password check ((purpose = 'register') = (password_hash is not null))
);

create index if not exists email_verification_codes_user_id_idx on scratch_prd.email_verification_codes (user_id);
create index if not exists email_verification_codes_expires_at_idx on scratch_prd.email_verification_codes (expires_at);

revoke all on scratch_prd.email_verification_codes from public, anon, authenticated, service_role;
grant select, insert, update, delete on scratch_prd.email_verification_codes to idea_ws_app;

alter table scratch_prd.email_verification_codes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'scratch_prd' and tablename = 'email_verification_codes' and policyname = 'idea_ws_app_all'
  ) then
    create policy idea_ws_app_all on scratch_prd.email_verification_codes
      for all to idea_ws_app using (true) with check (true);
  end if;
end;
$$;
