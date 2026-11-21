-- 0005 - Test Studio: private papers, question-only data, protected answer keys and versioned exports.
begin;

create table if not exists public.test_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  config jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('draft','ready','archived')),
  version integer not null default 1 check (version > 0),
  counts jsonb not null default '{"mcq":0,"short":0,"long":0}'::jsonb,
  total_marks integer not null default 0 check (total_marks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists test_papers_owner_updated on public.test_papers(user_id, updated_at desc);

create table if not exists public.test_questions (
  id uuid primary key,
  test_id uuid not null,
  user_id uuid not null,
  position integer not null check (position >= 0),
  type text not null check (type in ('mcq','short','long')),
  question text not null check (length(btrim(question)) > 0),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  marks integer not null check (marks between 1 and 100),
  source_reference text not null default '',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, id),
  unique (test_id, position),
  foreign key (test_id, user_id) references public.test_papers(id, user_id) on delete cascade
);
create index if not exists test_questions_owner_position on public.test_questions(user_id, test_id, position);

-- Answer data is deliberately stored separately and is not granted to anon/authenticated.
create table if not exists public.test_answer_keys (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null,
  question_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision > 0),
  correct_option integer check (correct_option between 0 and 3),
  model_answer text not null default '',
  explanation text not null default '',
  marking_scheme jsonb not null default '[]'::jsonb check (jsonb_typeof(marking_scheme) = 'array'),
  source_confidence text not null default 'supported' check (source_confidence in ('supported','uncertain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, question_id),
  foreign key (test_id, user_id) references public.test_papers(id, user_id) on delete cascade,
  foreign key (test_id, question_id) references public.test_questions(test_id, id) on delete cascade
);
create index if not exists test_answer_keys_owner_test on public.test_answer_keys(user_id, test_id);

create table if not exists public.test_exports (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null,
  user_id uuid not null,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  document_type text not null check (document_type in ('question_paper','answer_key','teacher_copy')),
  storage_key text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  test_version integer not null check (test_version > 0),
  language text not null,
  status text not null default 'ready' check (status in ('ready','outdated','failed')),
  created_at timestamptz not null default now(),
  foreign key (test_id, user_id) references public.test_papers(id, user_id) on delete cascade
);
create index if not exists test_exports_owner_created on public.test_exports(user_id, created_at desc);
create index if not exists test_exports_test_version on public.test_exports(test_id, test_version, document_type);

alter table public.test_papers enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_answer_keys enable row level security;
alter table public.test_exports enable row level security;

create policy "owners can read their test papers" on public.test_papers
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners can read their test questions" on public.test_questions
  for select to authenticated using ((select auth.uid()) = user_id);
-- No browser policies for answer keys or export metadata. Server routes authorize owners explicitly.

revoke all on public.test_papers from public, anon, authenticated;
revoke all on public.test_questions from public, anon, authenticated;
revoke all on public.test_answer_keys from public, anon, authenticated;
revoke all on public.test_exports from public, anon, authenticated;
grant all on public.test_papers to service_role;
grant all on public.test_questions to service_role;
grant all on public.test_answer_keys to service_role;
grant all on public.test_exports to service_role;

-- Atomic, version-checked replacement of question and answer rows.
-- p_expected_version=0 creates a new paper; otherwise the current owner/version is locked and checked.
create or replace function public.save_test_studio_paper(
  p_user uuid,
  p_test uuid,
  p_expected_version integer,
  p_title text,
  p_config jsonb,
  p_questions jsonb,
  p_answers jsonb,
  p_warnings jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
  v_new_version integer;
  v_total integer := 0;
  v_counts jsonb;
  v_q jsonb;
  v_a jsonb;
  v_position integer := 0;
  v_question_id uuid;
  v_updated timestamptz;
begin
  if p_user is null or p_test is null or p_expected_version < 0 then
    raise exception 'invalid_test_save' using errcode = '22023';
  end if;
  if p_title is null or length(btrim(p_title)) < 1 or length(p_title) > 200 then
    raise exception 'invalid_test_title' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 100
     or jsonb_typeof(p_answers) <> 'array' or jsonb_typeof(p_warnings) <> 'array' then
    raise exception 'invalid_test_payload' using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.test_papers(id,user_id,title,config,warnings,status,version)
    values(p_test,p_user,btrim(p_title),p_config,p_warnings,'ready',1)
    on conflict (id) do nothing;
    if not found then raise exception 'test_id_already_exists' using errcode = '23505'; end if;
    v_new_version := 1;
  else
    select version into v_current
      from public.test_papers
      where id = p_test and user_id = p_user
      for update;
    if not found then raise exception 'test_not_found' using errcode = 'P0002'; end if;
    if v_current <> p_expected_version then
      raise exception 'test_version_conflict' using errcode = '40001',
        detail = jsonb_build_object('expected',p_expected_version,'actual',v_current)::text;
    end if;
    v_new_version := v_current + 1;
    update public.test_papers
      set title=btrim(p_title), config=p_config, warnings=p_warnings, status='ready',
          version=v_new_version, updated_at=now()
      where id=p_test and user_id=p_user;
  end if;

  delete from public.test_answer_keys where test_id=p_test and user_id=p_user;
  delete from public.test_questions where test_id=p_test and user_id=p_user;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_question_id := (v_q->>'id')::uuid;
    if v_q->>'type' not in ('mcq','short','long')
       or coalesce(length(btrim(v_q->>'question')),0) = 0
       or coalesce((v_q->>'marks')::integer,0) not between 1 and 100
       or coalesce((v_q->>'revision')::integer,0) < 1 then
      raise exception 'invalid_question_row' using errcode = '22023';
    end if;
    if v_q->>'type' = 'mcq' and jsonb_array_length(coalesce(v_q->'options','[]'::jsonb)) <> 4 then
      raise exception 'invalid_mcq_options' using errcode = '22023';
    end if;
    insert into public.test_questions(id,test_id,user_id,position,type,question,options,marks,source_reference,revision)
    values (
      v_question_id,p_test,p_user,v_position,v_q->>'type',btrim(v_q->>'question'),
      coalesce(v_q->'options','[]'::jsonb),(v_q->>'marks')::integer,
      coalesce(v_q->>'sourceReference',''),(v_q->>'revision')::integer
    );
    v_position := v_position + 1;
    v_total := v_total + (v_q->>'marks')::integer;
  end loop;

  select jsonb_build_object(
    'mcq',count(*) filter (where type='mcq'),
    'short',count(*) filter (where type='short'),
    'long',count(*) filter (where type='long')
  ) into v_counts
  from public.test_questions where test_id=p_test and user_id=p_user;

  for v_a in select value from jsonb_array_elements(p_answers) loop
    v_question_id := (v_a->>'questionId')::uuid;
    if not exists (
      select 1 from public.test_questions q
      where q.test_id=p_test and q.user_id=p_user and q.id=v_question_id
        and q.revision=(v_a->>'revision')::integer
    ) then raise exception 'answer_question_revision_mismatch' using errcode = '22023'; end if;
    insert into public.test_answer_keys(
      test_id,question_id,user_id,revision,correct_option,model_answer,explanation,marking_scheme,source_confidence
    )
    values (
      p_test,v_question_id,p_user,(v_a->>'revision')::integer,
      nullif(v_a->>'correctOption','')::integer,
      coalesce(v_a->>'modelAnswer',''),coalesce(v_a->>'explanation',''),
      coalesce(v_a->'markingScheme','[]'::jsonb),
      coalesce(v_a->>'sourceConfidence','supported')
    );
  end loop;

  update public.test_papers
    set counts=v_counts,total_marks=v_total,updated_at=now()
    where id=p_test and user_id=p_user
    returning updated_at into v_updated;

  update public.test_exports set status='outdated'
    where test_id=p_test and user_id=p_user and status='ready';

  return jsonb_build_object('id',p_test,'version',v_new_version,'counts',v_counts,
    'totalMarks',v_total,'updatedAt',v_updated);
end;
$$;

revoke all on function public.save_test_studio_paper(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_test_studio_paper(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb)
  to service_role;

-- The previously scaffolded endpoints are now backed by real user-facing implementations.
update public.feature_flags
  set enabled=true, visible=true, coming_soon=false,
      config=coalesce(config,'{}'::jsonb) || jsonb_build_object(
        'generation_cost',10,'regeneration_cost',5,'max_questions',50,'max_sources',8,
        'max_source_mb',20,'daily_limit',20,'monthly_limit',300,'pdf_export',true
      ),
      updated_at=now()
  where key='teacher_tests';

update public.feature_flags
  set enabled=true, visible=true, coming_soon=false, updated_at=now()
  where key='file_upload';

commit;
