/** Pulls the first JSON value (object or array) out of an LLM reply, tolerating ``` fences and chatter. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  const direct = tryParse(cleaned);
  if (direct !== undefined) return direct;

  // try the bracket type that appears FIRST, so an outer array is not mistaken for its first inner object
  const pairs = ([['{', '}'], ['[', ']']] as const)
    .map(([open, close]) => ({ a: cleaned.indexOf(open), b: cleaned.lastIndexOf(close) }))
    .filter((p) => p.a !== -1 && p.b > p.a)
    .sort((x, y) => x.a - y.a);
  for (const { a, b } of pairs) {
    const v = tryParse(cleaned.slice(a, b + 1));
    if (v !== undefined) return v;
  }
  return undefined;
}
