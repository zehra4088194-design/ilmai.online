export type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  meta?: { kind?: string; quiz_id?: string; turn?: string } | null;
  streaming?: boolean;
  error?: boolean;
};

/** One user message + every model's answer to it (or a standalone quiz card). */
export type Group = { key: string; user?: Msg; answers: Msg[]; quiz?: Msg };

export function groupMessages(ms: Msg[]): Group[] {
  const out: Group[] = [];
  const byTurn = new Map<string, Group>();
  for (const m of ms) {
    if (m.role === 'user') {
      const g: Group = { key: m.id, user: m, answers: [] };
      out.push(g);
      byTurn.set(m.id, g);
    } else if (m.meta?.kind === 'quiz') {
      out.push({ key: m.id, answers: [], quiz: m });
    } else {
      const g = (m.meta?.turn && byTurn.get(m.meta.turn)) || [...out].reverse().find((x) => x.user);
      if (g) g.answers.push(m);
      else out.push({ key: m.id, answers: [m] });
    }
  }
  return out;
}
