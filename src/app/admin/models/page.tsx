import { getAllTextModels } from '@/lib/models';
import { PageHead } from '@/components/admin/AdminShell';
import { ModelsAdmin, type AdminModel } from '@/components/admin/ModelsAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let models: AdminModel[] = [];
  let err: string | null = null;
  try {
    models = (await getAllTextModels()).map(({ id, name, provider, context, pricePromptPerM, priceCompletionPerM, isFree, tier, enabled, isDefault }) =>
      ({ id, name, provider, context, pricePromptPerM, priceCompletionPerM, isFree, tier, enabled, isDefault }));
  } catch (e) { err = e instanceof Error ? e.message : 'Could not load models'; }
  return (
    <>
      <PageHead title="Models" sub="The live OpenRouter catalogue. Turn models on/off, set which plan can use them, and choose the default. New models appear here automatically (enabled by default; tier is auto-set from price)." />
      {err ? <div className="card p-6 text-danger">{err}</div> : <ModelsAdmin initial={models} />}
    </>
  );
}
