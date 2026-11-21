-- 0010 - Enable Presentation Studio with PPTX export; keep private PDF export gated until renderer deployment.
begin;

update public.feature_flags
set enabled = true,
    visible = true,
    coming_soon = false,
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'generation_cost', 10,
      'max_slides', 20,
      'pptx_export', true,
      'pdf_export', false
    ),
    updated_at = now()
where key = 'presentations';

update public.feature_flags
set config = jsonb_set(coalesce(config, '{}'::jsonb), '{pdf_export}', 'false'::jsonb, true),
    updated_at = now()
where key = 'teacher_tests';

commit;
