import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';

export const dynamic = 'force-dynamic';

/**
 * TODO(teacher tests): pipeline (details in docs/ROADMAP.md, tables `skills` + `test_jobs` already exist):
 *  images/PDF (B2) -> vision model OCR -> chapter text -> LLM + skill.instructions + skill.schema_json
 *  -> validated JSON (zod) -> inject into skill.template_html -> Playwright worker -> PDF -> B2 -> test_jobs.pdf_asset_id
 */
export const POST = handle(async () => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('teacher_tests', profile.plan, isAdmin);
  return json({ error: 'Teacher test maker is not implemented yet', code: 'not_implemented' }, 501);
});
