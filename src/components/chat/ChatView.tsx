'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Check, GraduationCap, FileEdit, Calculator, BookOpen, AlertTriangle } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { Markdown } from '@/components/chat/Markdown';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { Composer } from '@/components/chat/Composer';
import { MobileTopBar, useApp } from '@/components/chat/AppShell';
import { useModels } from '@/components/chat/useModels';
import { useToast } from '@/components/providers';
import { cn } from '@/lib/utils';

type Msg = { id: string; role: 'user' | 'assistant'; content: string; model?: string | null; streaming?: boolean; error?: boolean };

const SUGGESTIONS = [
  { Icon: GraduationCap, t: 'Explain photosynthesis in simple words', s: 'For a class 9 student' },
  { Icon: FileEdit, t: 'Write a polite leave application for school', s: 'Short and formal' },
  { Icon: Calculator, t: 'Solve 2x + 5 = 17 step by step', s: 'With a quick check' },
  { Icon: BookOpen, t: 'Ek chhoti si akhlaqi kahani Urdu mein likho', s: 'اردو میں' },
];

export function ChatView() {
  const params = useParams<{ id?: string[] }>();
  const routeId = params.id?.[0] ?? null;
  const { features, refreshConversations, refreshMe } = useApp();
  const toast = useToast();
  const { models, modelId, setModelId, loading: modelsLoading } = useModels();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const convRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  /* load / reset when the URL's conversation id changes (but not when WE set it after the first message) */
  useEffect(() => {
    if (routeId === convRef.current) return;
    abortRef.current?.abort();
    convRef.current = routeId;
    setBusy(false);
    if (!routeId) { setMessages([]); return; }
    setLoadingChat(true);
    fetch(`/api/conversations/${routeId}`).then((r) => r.json()).then((j) => {
      setMessages((j.messages ?? []).map((m: { id: string; role: 'user' | 'assistant'; content: string; model: string | null }) => ({ ...m })));
      stick.current = true;
    }).catch(() => toast('Could not load this chat', 'err')).finally(() => setLoadingChat(false));
  }, [routeId, toast]);

  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const send = useCallback(async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    if (!modelId) { toast('Please choose a model first', 'err'); return; }
    setInput('');
    setBusy(true);
    stick.current = true;
    const aid = crypto.randomUUID();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: t }, { id: aid, role: 'assistant', content: '', streaming: true, model: modelId }]);
    const ac = new AbortController();
    abortRef.current = ac;
    const patch = (p: Partial<Msg>) => setMessages((m) => m.map((x) => (x.id === aid ? { ...x, ...p } : x)));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ conversationId: convRef.current ?? undefined, model: modelId, message: t }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      const cid = res.headers.get('x-conversation-id');
      if (cid && !convRef.current) {
        convRef.current = cid;
        window.history.replaceState(null, '', `/chat/${cid}`);
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        patch({ content: acc });
      }
      patch({ streaming: false });
    } catch (e) {
      if (ac.signal.aborted) patch({ streaming: false });
      else {
        const msg = e instanceof Error ? e.message : 'Something went wrong';
        setMessages((m) => m.map((x) => (x.id === aid ? { ...x, streaming: false, error: true, content: x.content || msg } : x)));
        toast(msg, 'err');
      }
    } finally {
      setBusy(false);
      refreshConversations();
      refreshMe();
    }
  }, [input, busy, modelId, refreshConversations, refreshMe, toast]);

  const stop = () => abortRef.current?.abort();
  const empty = messages.length === 0 && !loadingChat;

  return (
    <>
      <MobileTopBar title="Ilm AI">
        <ModelPicker models={models} value={modelId} onChange={setModelId} disabled={modelsLoading || busy} />
      </MobileTopBar>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-6 pt-6">
          {loadingChat && <div className="space-y-4 pt-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}

          {empty && (
            <div className="m-auto w-full py-10 text-center">
              <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', damping: 14 }} className="mx-auto mb-5 w-fit">
                <LogoMark className="h-16 w-16 drop-shadow-lg" />
              </motion.div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">What will you <span className="text-gradient">learn</span> today?</h2>
              <p className="font-urdu mt-2 text-muted-foreground" dir="rtl">آج آپ کیا سیکھنا چاہیں گے؟</p>
              <div className="mx-auto mt-9 grid max-w-2xl gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map(({ Icon, t, s }, i) => (
                  <motion.button key={t} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }} whileHover={{ y: -3 }}
                    onClick={() => send(t)} className="card group p-4 text-left transition hover:border-primary/50 hover:shadow-glow">
                    <Icon className="mb-2 h-5 w-5 text-primary" />
                    <p className="text-sm font-semibold leading-snug">{t}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => <Bubble key={m.id} m={m} />)}
            </AnimatePresence>
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <Composer value={input} onChange={setInput} onSend={() => send()} onStop={stop} busy={busy} features={features}
          onUnavailable={(f) => toast(f.state === 'active' ? `${f.label}: the backend is ready, the chat UI for it is still to be built.` : `${f.label} is coming soon`, 'info')} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">AI can make mistakes. Please double-check important information.</p>
      </div>
    </>
  );
}

function Bubble({ m }: { m: Msg }) {
  const [copied, setCopied] = useState(false);
  if (m.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div dir="auto" className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[0.93rem] leading-relaxed text-primary-foreground shadow-soft">{m.content}</div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-3">
      <div className="mt-0.5 shrink-0"><LogoMark className="h-8 w-8" /></div>
      <div className="min-w-0 flex-1">
        {m.model && <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{m.model}</p>}
        {m.error ? (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{m.content}</div>
        ) : m.content ? (
          <div className={cn(m.streaming && '[&>.md>*:last-child]:cursor')}><Markdown>{m.content}</Markdown></div>
        ) : (
          <div className="flex items-center gap-1.5 py-2">{[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-primary" animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }} />)}</div>
        )}
        {!m.streaming && !m.error && m.content && (
          <button className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100"
            onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
