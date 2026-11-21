-- 0015 - Full website builder generation reservations.
begin;

alter table public.generation_requests
  drop constraint if exists generation_requests_kind_check;

alter table public.generation_requests
  add constraint generation_requests_kind_check
  check (kind in ('chat','compare','image','video','presentation','test','website'));

commit;
