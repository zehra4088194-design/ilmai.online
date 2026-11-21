-- 0008 - Save a regenerated paper and settle its reserved credits atomically.
begin;

create or replace function public.commit_test_regeneration(
  p_user uuid,
  p_test uuid,
  p_expected_version integer,
  p_title text,
  p_config jsonb,
  p_questions jsonb,
  p_answers jsonb,
  p_warnings jsonb,
  p_request uuid,
  p_charge bigint,
  p_usage jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved jsonb;
  v_settled jsonb;
  v_version integer;
begin
  v_saved := public.save_test_studio_paper(
    p_user, p_test, p_expected_version, p_title, p_config,
    p_questions, p_answers, p_warnings
  );
  v_version := (v_saved->>'version')::integer;

  v_settled := public.settle_generation(
    p_request, p_user, p_charge, p_usage,
    jsonb_build_object('testId',p_test,'version',v_version),
    null
  );

  return jsonb_build_object(
    'saved',v_saved,
    'settled',v_settled,
    'version',v_version
  );
end;
$$;

revoke all on function public.commit_test_regeneration(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_test_regeneration(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb,uuid,bigint,jsonb)
  to service_role;

commit;
