-- 0006 - Test Studio supporting indexes and owner-scoped read policies.
begin;

create index if not exists test_questions_test_user_fk_idx
  on public.test_questions(test_id, user_id);
create index if not exists test_answer_keys_test_user_fk_idx
  on public.test_answer_keys(test_id, user_id);
create index if not exists test_exports_test_user_fk_idx
  on public.test_exports(test_id, user_id);
create index if not exists test_exports_media_asset_fk_idx
  on public.test_exports(media_asset_id);

drop policy if exists "owners can read their test answer keys" on public.test_answer_keys;
create policy "owners can read their test answer keys" on public.test_answer_keys
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owners can read their test export metadata" on public.test_exports;
create policy "owners can read their test export metadata" on public.test_exports
  for select to authenticated using ((select auth.uid()) = user_id);

-- The policies are defense in depth. No direct browser table grants are added:
-- the application exposes answer keys and exports only through owner-checked API routes.
revoke all on public.test_answer_keys from public, anon, authenticated;
revoke all on public.test_exports from public, anon, authenticated;

commit;
