'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { MobileTopBar, useApp } from '@/components/chat/AppShell';
import { ModelBar } from '@/components/chat/ModelBar';
import { Composer } from '@/components/chat/Composer';
import { TurnView } from '@/components/chat/TurnView';
import { Suggestions } from '@/components/chat/Suggestions';
import { EmptyState } from '@/components/chat/EmptyState';
import { QuizBuilder, type QuizCreated } from '@/components/quiz/QuizBuilder';
import { QuizDialog } from '@/components/quiz/QuizDialog';
import { groupMessages, type Msg, type Attachment } from '@/components/chat/types';
import { useModels } from '@/components/chat/useModels';
import { useToast } from '@/components/providers';
import { iconFor } from '@/components/icons';
import { api } from '@/lib/client-api';

type ServerMsg = { id: string; role: 'user' | 'assistant'; content: string; model: string | null; attachments?: Attachment[]; meta: Msg['meta'] };

export function ChatView() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const routeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] || null : null;
  const modeParam = sp.get('mode');

  const { modes, features, featureOn, audience, refreshConversations, refreshMe } = useApp();
  const toast = useToast();
  const { models, selected, toggle, maxParallel, loading: modelsLoading } = useModels();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [modeSlug, setModeSlug] = useState<string | null>(modeParam);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [quizDlg, setQuizDlg] = useState<{ topic?: string; context?: string } | null>(null);

  const convRef = useRef<string | null>(null);
  const aborts = useRef<AbortController[]>([]);
  const sugToken = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (routeId === convRef.current) return;
    aborts.current.forEach((a) => a.abort());
    convRef.current = routeId;
    sugToken.current++;
    setBusy(false); setAttachments([]); setUploading(false); setSuggestions([]); setSugLoading(false);
    if (!routeId) { setMessages([]); return; }
    setLoadingChat(true);
    api<{ conversation: { mode: string | null }; messages: ServerMsg[] }>('/api/conversations/' + routeId, 'GET')
      .then((j) => {
        setMessages(j.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, model: m.model, attachments: m.attachments ?? [], meta: m.meta })));
        setModeSlug(j.conversation?.mode ?? null); stick.current = true;
      })
      .catch(() => toast('Could not load this chat', 'err'))
      .finally(() => setLoadingChat(false));
  }, [routeId, toast]);

  useEffect(() => { if (!routeId) setModeSlug(modeParam); }, [routeId, modeParam]);
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, suggestions]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  const loadSuggestions = useCallback(async (user: string, assistant: string) => {
    const token = ++sugToken.current;
    setSugLoading(true);
    try {
      const r = await api<{ suggestions: string[] }>('/api/suggest', 'POST', { user, assistant: assistant.slice(0, 6000), mode: modeSlug });
      if (token === sugToken.current) setSuggestions(r.suggestions ?? []);
    } catch { /* suggestions are optional */ } finally { if (token === sugToken.current) setSugLoading(false); }
  }, [modeSlug]);

  async function streamOne(cid: string, umid: string, model: string, multi: boolean, aid: string): Promise<string> {
    const ac = new AbortController();
    aborts.current.push(ac);
    const patch = (p: Partial<Msg>) => setMessages((ms) => ms.map((x) => (x.id === aid ? { ...x, ...p } : x)));
    let acc = '';
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify({ conversationId: cid, userMessageId: umid, model, multi }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
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
        patch({ streaming: false, error: true, content: acc || msg });
        if (!multi) toast(msg, 'err');
        acc = '';
      }
    }
    return acc;
  }

  const send = useCallback(async (text?: string) => {
    const t = (text ?? input).trim();
    const selectedAttachments = [...attachments];
    if ((!t && selectedAttachments.length === 0) || busy || uploading) return;
    if (!selected.length) { toast('Please choose a model first', 'err'); return; }
    const chosen = [...selected];
    const multi = chosen.length > 1;
    setInput(''); setBusy(true); setSuggestions([]); sugToken.current++; setSugLoading(false); stick.current = true;
    aborts.current = [];

    let cid = convRef.current;
    let umid: string;
    try {
      const attachmentIds = selectedAttachments.map((file) => file.asset_id);
      if (!cid) {
        const r = await api<{ id: string; userMessageId: string }>('/api/conversations', 'POST', {
          firstMessage: t, attachmentIds, model: chosen[0], mode: modeSlug,
        });
        cid = r.id; umid = r.userMessageId; convRef.current = cid;
        window.history.replaceState(null, '', '/chat/' + cid);
      } else {
        umid = (await api<{ id: string }>('/api/conversations/' + cid + '/messages', 'POST', { content: t, attachmentIds })).id;
      }
      setAttachments([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send', 'err');
      setBusy(false); setInput(t);
      return;
    }

    const aid = (m: string) => umid + ':' + m;
    setMessages((ms) => [
      ...ms,
      { id: umid, role: 'user', content: t || 'Please analyze the attached files.', attachments: selectedAttachments },
      ...chosen.map((m): Msg => ({ id: aid(m), role: 'assistant', content: '', model: m, streaming: true, meta: { turn: umid } })),
    ]);

    const results = await Promise.all(chosen.map((m) => streamOne(cid!, umid, m, multi, aid(m))));
    setBusy(false);
    refreshConversations();
    refreshMe();
    const firstOk = results.find((r) => r.length > 0);
    if (firstOk && featureOn('suggestions')) loadSuggestions(t, firstOk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, attachments, busy, uploading, selected, modeSlug, featureOn, loadSuggestions, refreshConversations, refreshMe, toast]);

  const stop = () => aborts.current.forEach((a) => a.abort());

  const onQuizCreated = (r: QuizCreated) => {
    if (!convRef.current) { convRef.current = r.conversationId; window.history.replaceState(null, '', '/chat/' + r.conversationId); }
    setMessages((ms) => [...ms, { id: r.messageId ?? crypto.randomUUID(), role: 'assistant', content: r.content, meta: { kind: 'quiz', quiz_id: r.quizId } }]);
    setQuizDlg(null); setSuggestions([]); stick.current = true;
    refreshConversations();
  };

  const lastGroup = groups[groups.length - 1];
  const quizOn = featureOn('quiz');
  const askQuizOnThis = () => {
    const lastUser = [...groups].reverse().find((g) => g.user)?.user?.content ?? '';
    const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant' && !m.meta?.kind && m.content && !m.error)?.content ?? '';
    setQuizDlg({ topic: lastUser.slice(0, 80), context: lastAnswer.slice(0, 7000) });
  };

  const empty = messages.length === 0 && !loadingChat;
  const ModeIcon = mode ? iconFor(mode.icon) : null;

  return (
    <>
      <MobileTopBar title={mode?.name ?? 'Ilm AI'} icon={ModeIcon ? <ModeIcon className="h-4 w-4 text-primary" /> : undefined} />
      <div className="glass relative z-20 shrink-0 border-x-0 border-t-0 px-3 py-1.5">
        {modelsLoading ? <div className="h-7 w-48 animate-pulse rounded-full bg-muted" /> : <ModelBar models={models} selected={selected} onToggle={toggle} max={maxParallel} disabled={busy} />}
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-6 pt-6">
          {loadingChat && <div className="mx-auto w-full max-w-3xl space-y-4 pt-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
          {empty && (
            <EmptyState mode={mode} modes={modes} audience={audience} onSend={send}
              quizSlot={mode?.tool === 'quiz' && quizOn ? <QuizBuilder mode={modeSlug} conversationId={convRef.current} onCreated={onQuizCreated} /> : undefined} />
          )}
          <div className="space-y-7">
            {groups.map((g) => <TurnView key={g.key} group={g} names={names} onAsk={send} onNewQuiz={(topic) => setQuizDlg({ topic })} />)}
            {!busy && lastGroup && (suggestions.length > 0 || sugLoading || (quizOn && !lastGroup.quiz)) && (
              <Suggestions items={suggestions} loading={sugLoading} onPick={send} onQuiz={quizOn && !lastGroup.quiz && lastGroup.answers.some((a) => !a.error) ? askQuizOnThis : undefined} />
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <Composer value={input} onChange={setInput} onSend={() => send()} onStop={stop} busy={busy} uploading={uploading}
          attachments={attachments} onAttachmentsChange={setAttachments} onUploadingChange={setUploading}
          features={features} onQuiz={quizOn ? () => setQuizDlg({}) : undefined}
          onUnavailable={(f) => toast(f.state === 'active' ? (f.label + ': this chat action is not available yet.') : (f.label + ' is coming soon'), 'info')} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">AI can make mistakes. Please double-check important information.</p>
      </div>

      <QuizDialog open={!!quizDlg} onClose={() => setQuizDlg(null)} conversationId={convRef.current} mode={modeSlug}
        defaultTopic={quizDlg?.topic} context={quizDlg?.context} onCreated={onQuizCreated} key={quizDlg?.topic ?? 'new'} />
    </>
  );
}
