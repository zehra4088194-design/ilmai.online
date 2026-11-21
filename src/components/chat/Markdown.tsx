'use client';
import { Children, isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from '@/lib/markdown-math';
import 'katex/dist/katex.min.css';
import { Check, Copy } from 'lucide-react';

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
      <pre className="m-0 overflow-x-auto p-3.5 font-mono text-[0.82rem] leading-relaxed"><code>{text}</code></pre>
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
