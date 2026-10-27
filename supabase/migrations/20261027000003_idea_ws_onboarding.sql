-- ========================================================
-- Idea Workspace: 初回オンボーディングの状態（Phase 7）
--   ユーザー設定として users に持つ（登録しても同じ行なので引き継がれる）
-- ========================================================

alter table idea_ws.users
  add column onboarding_completed_at timestamptz,
  add column onboarding_result text check (onboarding_result in ('completed', 'skipped')),
  add constraint users_onboarding_consistent check ((onboarding_completed_at is null) = (onboarding_result is null));
