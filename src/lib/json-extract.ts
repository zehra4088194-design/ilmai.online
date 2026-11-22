/**
 * Extracts the first complete JSON object or array from a model response.
 * Handles fenced output, leading/trailing prose, nested values and escaped quotes.
 */
function tryParse(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return undefined;
  }
}

function parseBalancedValue(source: string, start: number): unknown {
  const opening = source[start];
  if (opening !== '{' && opening !== '[') return undefined;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack.pop() !== expected) return undefined;

      if (stack.length === 0) {
        return tryParse(source.slice(start, i + 1));
      }
    }
  }

  return undefined;
}

export function extractJson(text: string): unknown {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.split(fence + 'json').join('').split(fence).join('').trim();
  const direct = tryParse(cleaned);
  if (direct !== undefined) return direct;

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== '{' && cleaned[i] !== '[') continue;
    const parsed = parseBalancedValue(cleaned, i);
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}
