export type HistRow = { role: 'user' | 'assistant' | 'system'; content: string; model: string | null; meta?: { kind?: string } | null };
export type HistMsg = { role: 'user' | 'assistant'; content: string };

/**
 * Turns stored rows (oldest → newest) into the message list sent to ONE model.
 * - A turn = a user message + every model's answer to it.
 * - Each model sees ITS OWN earlier answers; if it did not answer a turn (it was added later) it sees the first answer instead.
 * - Quiz cards and unanswered turns are skipped so user/assistant messages keep alternating.
 */
export function buildHistory(rows: HistRow[], model: string, turnsToKeep: number): HistMsg[] {
  const turns: { user: string; answers: { model: string | null; content: string }[] }[] = [];
  for (const r of rows) {
    if (r.role === 'user') turns.push({ user: r.content, answers: [] });
    else if (r.role === 'assistant' && r.meta?.kind !== 'quiz') turns.at(-1)?.answers.push({ model: r.model, content: r.content });
  }
  const out: HistMsg[] = [];
  for (const t of turns.slice(-turnsToKeep)) {
    const a = t.answers.find((x) => x.model === model) ?? t.answers[0];
    if (!a) continue;
    out.push({ role: 'user', content: t.user }, { role: 'assistant', content: a.content });
  }
  return out;
}
