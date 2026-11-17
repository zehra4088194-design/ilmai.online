import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};

export async function GET() {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 1800 },
      headers: { "User-Agent": "IlmAI/1.0" }
    });
    if (!response.ok) throw new Error("Model catalogue unavailable");
    const payload = await response.json();
    const data: OpenRouterModel[] = Array.isArray(payload.data) ? payload.data : [];

    const models = data
      .filter((model) => {
        const inputs = model.architecture?.input_modalities ?? ["text"];
        const outputs = model.architecture?.output_modalities ?? ["text"];
        return inputs.includes("text") && outputs.includes("text") && model.pricing;
      })
      .map((model) => {
        const inputPrice = Number(model.pricing?.prompt ?? 0);
        const outputPrice = Number(model.pricing?.completion ?? 0);
        return {
          id: model.id,
          name: model.name || model.id,
          contextLength: model.context_length ?? null,
          inputPrice,
          outputPrice,
          isFree: inputPrice === 0 && outputPrice === 0
        };
      })
      .sort((a, b) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        return (a.inputPrice + a.outputPrice) - (b.inputPrice + b.outputPrice);
      })
      .slice(0, 60);

    return NextResponse.json({ models, updatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" }
    });
  } catch {
    return NextResponse.json({
      models: [],
      error: "The live model catalogue could not be loaded. Check your connection and try again."
    }, { status: 503 });
  }
}