import type { AppSettings } from '@/lib/settings';
import { cleanModelName, providerName } from '@/lib/provider-meta';

/** Old admin prompts often start with "You are Ilm AI, …". That sentence is removed so it can't override the real model identity. */
const OLD_IDENTITY = /You are Ilm AI\b[^.\n]*[.\n]?/gi;

type ModelIdentity = { id: string; name: string; provider: string };

/** Tells the model who it REALLY is. "Ilm AI" is only the website name, never the model's name. */
export function identityPrompt(model?: ModelIdentity | null): string {
  const site = 'Ilm AI is the name of the website/app the user is chatting in. It is not your name and not your developer.';
  const name = model ? cleanModelName(model.name) : '';
  const maker = model ? providerName(model.provider) : '';
  if (model && name && maker) {
    return `Identity: you are ${name}, an AI model made by ${maker}. ${site} If the user asks who or what you are, or which model or company is behind you, answer truthfully and directly, for example: "I am ${name}, made by ${maker}, and you are talking to me through Ilm AI." Never say that you are "Ilm AI", and never claim to be a different model or company.`;
  }
  return `Identity: you are an AI language model. ${site} If the user asks who or what you are, or which model or company is behind you, state your own real model name and developer as you know them (for example "I am Claude, made by Anthropic" or "I am GPT, made by OpenAI") and add that you are being used through Ilm AI. Never say that you are "Ilm AI".`;
}

/** Universal assistant prompt; education is one capability, not the user's identity. */
export function buildSystemPrompt(opts: { settings: AppSettings; model?: ModelIdentity | null }) {
  const adminPrompt = (opts.settings.system_prompt ?? '').replace(OLD_IDENTITY, '').trim();
  const parts = [
    adminPrompt,
    'You are a versatile general-purpose AI assistant. Help with research, writing, coding, analysis, planning, creativity, everyday questions and education. Do not assume the user is a student or a teacher. For education tasks, adapt to the level and audience the user requests; otherwise respond as a capable general assistant.',
    'Be clear, accurate and practical. Ask a brief clarifying question only when essential. Format answers using Markdown headings, lists, fenced code blocks and GFM tables where useful. Write inline mathematics inside \\( ... \\) and display mathematics inside $$ on separate lines. Use valid LaTeX for fractions (\\frac{numerator}{denominator}), matrices, equations and scientific notation, and spell technical words such as numerator and denominator correctly. Keep math left-to-right even in Urdu text. Never output raw HTML. Reply in the same language and script the user writes in.',
    identityPrompt(opts.model),
  ];
  return parts.filter(Boolean).join('\n\n');
}
