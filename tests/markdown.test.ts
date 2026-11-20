import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '@/components/chat/Markdown';
import { normalizeMathDelimiters } from '@/lib/markdown-math';

const render = (text: string) => renderToStaticMarkup(React.createElement(Markdown, null, text));

describe('safe mathematical Markdown', () => {
  it('renders inline TeX and matrices', () => {
    expect(render(String.raw`Energy \(E=mc^2\)`)).toContain('class="katex"');
    expect(render(String.raw`$$\begin{bmatrix}a & b\\c & d\end{bmatrix}$$`)).toContain('mtable');
    expect(render(String.raw`\[\frac{1}{\sqrt{x}}\]`)).toContain('katex-display');
  });
  it('preserves literal code and incomplete streaming delimiters', () => {
    const code = '```tex\n\\(literal\\)\n```\n`\\(code\\)`';
    expect(normalizeMathDelimiters(code)).toBe(code);
    for (const text of ['\\(', '$$\\frac{', '$$\\begin{bmatrix}a &']) expect(() => render(text)).not.toThrow();
  });
  it('renders real tables inside a scroll container', () => {
    const html = render('| Name | Value |\n|---|---|\n| x | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('overflow-x-auto');
  });
  it('never enables AI HTML, executable links or remote tracking images', () => {
    const html = render('<script>alert(1)</script>\n\n[x](javascript:alert)\n\n![tracker](https://example.test/pixel)');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<img');
    expect(render(String.raw`$$\href{javascript:alert(1)}{x}$$`)).not.toContain('href="javascript:');
  });
});
