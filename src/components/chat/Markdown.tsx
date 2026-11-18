'use client';
import { Children, isValidElement, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = Children.toArray(children)[0];
  const props = isValidElement(child) ? (child.props as { className?: string; children?: ReactNode }) : {};
  const lang = /language-([\w-]+)/.exec(props.className ?? '')?.[1] ?? 'code';
  const text = String(props.children ?? '').replace(/\n$/, '');
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0b1a13] text-[#d7f5e3]" dir="ltr">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-1.5 text-xs text-emerald-200/70">
        <span className="font-mono">{lang}</span>
        <button className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-white/10 hover:text-white"
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ({ children }) => <CodeBlock>{children}</CodeBlock> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
