export function normalizeMathDelimiters(text: string): string {
  const protectedParts = /(`{3,}[^\n]*\n[\s\S]*?(?:\n`{3,}(?=\n|$)|$)|~{3,}[^\n]*\n[\s\S]*?(?:\n~{3,}(?=\n|$)|$)|`+[^`\n]*`+)/g;
  return text.split(protectedParts).map((part, index) => {
    if (index % 2) return part;
    return part
      .replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`)
      .replace(/(?<!\\)\\\(([^\n]*?)(?<!\\)\\\)/g, (_, math: string) => `$${math.trim()}$`);
  }).join('');
}
