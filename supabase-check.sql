-- Run in Supabase -> SQL Editor. Read-only checks (nothing is changed).

-- 1) Are Suggestions / Quiz / Chat switched on for the FREE plan?
select key, enabled, visible, coming_soon, min_plan
from public.feature_flags
where key in ('text_chat','suggestions','quiz','compare_models','file_upload');

-- 2) Helper-model settings used by Suggestions, Quiz and Enhance
select key, value
from public.app_settings
where key in ('utility_models','suggestions_per_day','quizzes_per_day','quiz_max_questions','system_prompt');

-- 3) Last errors from Suggestions / Quiz / Enhance (tells you exactly why they failed)
select created_at, kind, model, status, left(error, 160) as error
from public.usage_events
where kind in ('suggest','quiz','prompt_enhance') and status = 'error'
order by created_at desc
limit 15;
