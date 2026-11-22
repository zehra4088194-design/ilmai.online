import { getAllTextModels } from '@/lib/models';
import { PageHead } from '@/components/admin/AdminShell';
import { ModelsAdmin, type AdminModel } from '@/components/admin/ModelsAdmin';
import { MediaModelsAdmin } from '@/components/admin/MediaModelsAdmin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let models: AdminModel[] = [];
  let err: string | null = null;
  try {
    models = (await getAllTextModels()).map(({ id, name, provider, context, pricePromptPerM, priceCompletionPerM, isFree, tier, enabled, isDefault }) =>
      ({ id, name, provider, context, pricePromptPerM, priceCompletionPerM, isFree, tier, enabled, isDefault }));
  } catch (e) { err = e instanceof Error ? e.message : 'Could not load text models'; }
  return (
    <>
      <PageHead title="Models" sub="Manage OpenRouter text models, plus the live Picsart image and video catalogues. Media models can be enabled, disabled and assigned separate defaults." />
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-extrabold">Text models</h2>
          <p className="text-sm text-muted-foreground">OpenRouter catalogue and plan access.</p>
        </div>
        {err ? <div className="card p-6 text-danger">{err}</div> : <ModelsAdmin initial={models} />}
      </section>
      <MediaModelsAdmin />
    </>
  );
}
