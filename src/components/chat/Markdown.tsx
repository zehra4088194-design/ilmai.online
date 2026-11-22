'use client';
import { Children, isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from '@/lib/markdown-math';
import 'katex/dist/katex.min.css';
import { Check, Copy } from 'lucide-react';

const KEYWORDS = new Set(('and as assert async await break case catch class const continue def del do else elif enum export extends finally for from fun fn function if implements import in instanceof interface let match new not of or package pass private protected public raise return self static super switch then this throw try type typeof var void while with yield').split(' '));
const BUILTINS = new Set(('print len range enumerate zip map filter reduce sum min max abs round sorted reversed list dict set tuple str int float bool None True False console Math JSON Array Object String Number Promise Date').split(' '));

function highlightedCode(source: string) {
  const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[\t ]*#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60|\b[A-Za-z_$][\w$]*(?=\s*\()|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[{}()\[\].,:;])/gm;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = tokenPattern.exec(source))) {
    if (match.index > cursor) parts.push(source.slice(cursor, match.index));
    const token = match[0];
    let kind = '';
    if (/^(\/\\*|\/\/|#)/.test(token)) kind = 'comment';
    else if (/^["'`]/.test(token)) kind = 'string';
    else if (/^\\d/.test(token)) kind = 'number';
    else if (KEYWORDS.has(token)) kind = 'keyword';
    else if (BUILTINS.has(token)) kind = 'builtin';
    else if (/^[A-Za-z_$]/.test(token) && /^\\s*\\(/.test(source.slice(match.index + token.length))) kind = 'function';
    else if (/^[{}()\\[\\].,:;]$/.test(token)) kind = 'punctuation';
    parts.push(kind ? <span key={index++} className={`code-token code-token--${kind}`}>{token}</span> : token);
    cursor = match.index + token.length;
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children)[0];
  const props = isValidElement(child) ? (child.props as { className?: string; children?: ReactNode }) : {};
  const lang = /language-([\w-]+)/.exec(props.className ?? '')?.[1] ?? 'code';
  const text = String(props.children ?? '').replace(/\n$/, '');
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-card text-foreground" dir="ltr">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang}</span>
        <button className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-muted hover:text-foreground"
          onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-block__pre m-0 overflow-x-auto p-3.5 font-mono leading-relaxed"><code>{highlightedCode(text)}</code></pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md" dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false, maxExpand: 1000 }]]} skipHtml
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => <div className="overflow-x-auto" role="region" aria-label="Table" tabIndex={0}><table>{children}</table></div>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          img: ({ alt }) => <span className="text-muted-foreground">{alt || 'Image'}</span>,
        }}>
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  );
}
