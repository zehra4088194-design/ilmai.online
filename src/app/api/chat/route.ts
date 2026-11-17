import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;

type ChatMessage = { role: "user" | "assistant"; content: string };

const CHAT_SYSTEM = "You are Ilm AI, a thoughtful, accurate, encouraging assistant for students, teachers and independent learners. Explain clearly, adapt to the user's level, use headings and examples when useful, and never invent sources or facts. Ask a concise follow-up only when essential. Use English unless the user explicitly requests another language.";

const QUIZ_SYSTEM = "You are Ilm AI Quiz Maker. Create a useful quiz grounded in the supplied conversation and topic. Return ONLY valid JSON with this exact shape: { \"title\": string, \"instructions\": string, \"questions\": [{ \"question\": string, \"options\": [string,string,string,string], \"correctIndex\": number, \"explanation\": string }] }. Create 5 multiple-choice questions, each with exactly four options, one correctIndex from 0 to 3, and a brief helpful explanation. Mix recall and understanding. Do not include markdown fences.";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "AI is not connected yet. Add OPENROUTER_API_KEY to the server environment to enable live responses."
    }, { status: 503 });
  }

  try {
    const body = await request.json();
    const model = typeof body.model === "string" ? body.model : "";
    const task = body.task === "quiz" ? "quiz" : "chat";
    const messages: ChatMessage[] = Array.isArray(body.messages)
      ? body.messages
          .filter((item: unknown): item is ChatMessage =>
            !!item &&
            typeof item === "object" &&
            ("role" in item) &&
            ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
            typeof (item as ChatMessage).content === "string"
          )
          .slice(-24)
          .map((item) => ({ role: item.role, content: item.content.slice(0, 18000) }))
      : [];

    if (!model || !/^[a-zA-Z0-9._:/-]{2,180}$/.test(model)) {
      return NextResponse.json({ error: "Choose a valid AI model first." }, { status: 400 });
    }
    if (!messages.length) {
      return NextResponse.json({ error: "Add a message or topic first." }, { status: 400 });
    }

    const system = task === "quiz" ? QUIZ_SYSTEM : CHAT_SYSTEM;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "Ilm AI"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature: task === "quiz" ? 0.35 : 0.7,
        usage: { include: true }
      }),
      signal: AbortSignal.timeout(85000)
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || "The selected model could not complete this request.";
      return NextResponse.json({ error: String(message).slice(0, 500) }, { status: response.status });
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "The model returned an empty response. Please try again." }, { status: 502 });
    }

    const usage = payload?.usage ?? {};
    const apiCostUsd = usage.cost !== undefined && Number.isFinite(Number(usage.cost))
      ? Number(usage.cost)
      : null;
    const configuredMarkup = Number(process.env.ILM_MARKUP_PERCENT ?? "25");
    const markupPercent = Number.isFinite(configuredMarkup)
      ? Math.min(500, Math.max(0, configuredMarkup))
      : 25;
    const billableCostUsd = apiCostUsd === null
      ? null
      : Number((apiCostUsd * (1 + markupPercent / 100)).toFixed(8));

    return NextResponse.json({
      content,
      model: payload?.model || model,
      usage: {
        inputTokens: Number(usage.prompt_tokens ?? 0),
        outputTokens: Number(usage.completion_tokens ?? 0),
        totalTokens: Number(usage.total_tokens ?? 0),
        apiCostUsd,
        billableCostUsd,
        markupPercent
      }
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "This request took too long. Try a smaller prompt or another model."
      : "Something went wrong while contacting the AI provider. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}