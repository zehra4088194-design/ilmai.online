'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useApp } from '@/components/chat/AppShell';
import { ModelBar } from '@/components/chat/ModelBar';
import { Composer } from '@/components/chat/Composer';
import { TurnView } from '@/components/chat/TurnView';
import { Suggestions } from '@/components/chat/Suggestions';
import { EmptyState } from '@/components/chat/EmptyState';
import type { QuizCreated } from '@/components/quiz/QuizBuilder';
import { QuizDialog } from '@/components/quiz/QuizDialog';
import { groupMessages, type Msg, type Attachment } from '@/components/chat/types';
import { useModels } from '@/components/chat/useModels';
import { useToast } from '@/components/providers';
import { api } from '@/lib/client-api';
import { createSpeechRecognition, type SpeechRecognitionLike } from '@/lib/speech';
import { WebsiteBuilderDialog } from '@/components/website/WebsiteBuilderDialog';

type ServerMsg = { id: string; role: 'user' | 'assistant'; content: string; model: string | null; attachments?: Attachment[]; meta: Msg['meta'] };

export function ChatView() {
  const pathname = usePathname();
  const routeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] || null : null;

  const { features, featureOn, refreshConversations, refreshMe, openSidebar } = useApp();
  const toast = useToast();
  const { models, selected, toggle, maxParallel, loading: modelsLoading } = useModels();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [quizDlg, setQuizDlg] = useState<{ topic?: string; context?: string } | null>(null);
  const [websiteBuilderOpen, setWebsiteBuilderOpen] = useState(false);
  const [thinking, setThinking] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
  const [enhancing, setEnhancing] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle'|'listening'|'thinking'|'speaking'>('idle');

  const names = useMemo(() => new Map(models.map((m) => [m.id, m.name.replace(/^[^:]+:\\s*/, '')])), [models]);
  const groups = useMemo(() => groupMessages(messages), [messages]);

  const convRef = useRef<string | null>(null);
  const aborts = useRef<AbortController[]>([]);
  const sugToken = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const callRecognition = useRef<SpeechRecognitionLike | null>(null);
  const callActiveRef = useRef(false);
  const callPausedRef = useRef(false);
  const sendRef = useRef<((text?: string) => Promise<void>) | null>(null);
  const busyRef = useRef(false);

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
        stick.current = true;
      })
      .catch(() => toast('Could not load this chat', 'err'))
      .finally(() => setLoadingChat(false));
  }, [routeId, toast]);

  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, suggestions]);

  useEffect(() => {
    callActiveRef.current = callActive;
    if (!callActive) {
      setCallStatus('idle');
      callPausedRef.current = false;
      try { callRecognition.current?.stop(); } catch { /* already stopped */ }
      callRecognition.current = null;
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      return;
    }

    const speech = createSpeechRecognition();
    if (!speech) {
      setCallActive(false);
      setCallStatus('idle');
      toast('Voice call is not supported in this browser. Use Chrome over HTTPS.', 'info');
      return;
    }
    speech.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    speech.continuous = false;
    speech.interimResults = false;
    speech.maxAlternatives = 1;
    speech.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? '').join(' ').trim();
      if (!transcript) return;
      setCallStatus('thinking');
      callPausedRef.current = true;
      speech.stop();
      void sendRef.current?.(transcript);
    };
    speech.onstart = () => setCallStatus('listening');
    speech.onerror = (event) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error ?? '')) {
        callPausedRef.current = true;
        callActiveRef.current = false;
        setCallActive(false);
        setCallStatus('idle');
        toast('Voice call stopped. Check microphone permission and make sure no other app is using the microphone.', 'err');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast('Voice call microphone error: ' + (event.error ?? 'check permissions'), 'err');
      }
    };
    speech.onend = () => {
      if (callActiveRef.current && !callPausedRef.current && !busyRef.current) setCallStatus('listening');
      if (callActiveRef.current && !callPausedRef.current && !busyRef.current) {
        window.setTimeout(() => {
          if (callActiveRef.current && !callPausedRef.current && !busyRef.current) {
            try { callRecognition.current?.start(); } catch { /* browser may still be closing the previous recognition session */ }
          }
        }, 350);
      }
    };
    callRecognition.current = speech;
    callPausedRef.current = false;
    try { speech.start(); setCallStatus('listening'); }
    catch {
      setCallActive(false);
      setCallStatus('idle');
      toast('Could not start the voice call. Check microphone permissions.', 'err');
    }
    return () => {
      try { speech.abort(); } catch { /* cleanup */ }
      if (callRecognition.current === speech) callRecognition.current = null;
    };
  }, [callActive, toast]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  const loadSuggestions = useCallback(async (user: string, assistant: string) => {
    const token = ++sugToken.current;
    setSugLoading(true);
    try {
      const r = await api<{ suggestions: string[] }>('/api/suggest', 'POST', { user, assistant: assistant.slice(0, 6000) });
      if (token === sugToken.current) setSuggestions(r.suggestions ?? []);
    } catch { /* suggestions are optional */ } finally { if (token === sugToken.current) setSugLoading(false); }
  }, []);

  async function streamOne(cid: string, umid: string, model: string, multi: boolean, aid: string, effort: 'low' | 'medium' | 'high' | undefined): Promise<string> {
    const ac = new AbortController();
    aborts.current.push(ac);
    const patch = (p: Partial<Msg>) => setMessages((ms) => ms.map((x) => (x.id === aid ? { ...x, ...p } : x)));
    let acc = '';
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify({ conversationId: cid, userMessageId: umid, model, multi, thinking: effort }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      const actualModel = res.headers.get('x-ilm-model');
      if (actualModel) patch({ model: actualModel });
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

  function resumeVoiceCall() {
    callPausedRef.current = false;
    if (callActiveRef.current && !busyRef.current) {
      try { callRecognition.current?.start(); } catch { /* browser recognition may still be ending */ }
    }
  }

  const send = useCallback(async (text?: string) => {
    const t = (text ?? input).trim();
    const selectedAttachments = [...attachments];
    if ((!t && selectedAttachments.length === 0) || busy || uploading) return;
    if (!selected.length) {
      toast('Please choose a model first', 'err');
      resumeVoiceCall();
      return;
    }
    const chosen = [...selected];
    const multi = chosen.length > 1;
    setInput(''); setBusy(true); busyRef.current = true; setSuggestions([]); sugToken.current++; setSugLoading(false); stick.current = true;
    if (callActiveRef.current) callPausedRef.current = true;
    aborts.current = [];

    let cid = convRef.current;
    let umid: string;
    try {
      const attachmentIds = selectedAttachments.map((file) => file.asset_id);
      if (!cid) {
        const r = await api<{ id: string; userMessageId: string }>('/api/conversations', 'POST', {
          firstMessage: t, attachmentIds, model: chosen[0],
        });
        cid = r.id; umid = r.userMessageId; convRef.current = cid;
        window.history.replaceState(null, '', '/chat/' + cid);
      } else {
        umid = (await api<{ id: string }>('/api/conversations/' + cid + '/messages', 'POST', { content: t, attachmentIds })).id;
      }
      setAttachments([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send', 'err');
      setBusy(false); busyRef.current = false; setInput(t); resumeVoiceCall();
      return;
    }

    const aid = (m: string) => umid + ':' + m;
    setMessages((ms) => [
      ...ms,
      { id: umid, role: 'user', content: t || 'Please analyze the attached files.', attachments: selectedAttachments },
      ...chosen.map((m): Msg => ({ id: aid(m), role: 'assistant', content: '', model: m, streaming: true, meta: { turn: umid } })),
    ]);

    const effort = thinking === 'auto' ? undefined : thinking;
    const results = await Promise.all(chosen.map((m) => streamOne(cid!, umid, m, multi, aid(m), effort)));
    setBusy(false);
    busyRef.current = false;
    refreshConversations();
    refreshMe();
    const firstOk = results.find((r) => r.length > 0);
    if (firstOk && featureOn('suggestions')) loadSuggestions(t, firstOk);
    if (firstOk && callActiveRef.current && typeof window !== 'undefined' && window.speechSynthesis) {
      const spoken = firstOk.replace(/(```[\s\S]*?```|[*_#>`])/g, ' ').replace(/https?:\/\/\S+/g, 'link').slice(0, 5000);
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.onstart = () => setCallStatus('speaking');
      utterance.onend = () => {
        setCallStatus(callActiveRef.current ? 'listening' : 'idle');
        callPausedRef.current = false;
        if (callActiveRef.current && !busyRef.current) {
          try { callRecognition.current?.start(); } catch { /* recognition session may still be closing */ }
        }
      };
      utterance.onerror = () => {
        setCallStatus(callActiveRef.current ? 'listening' : 'idle');
        callPausedRef.current = false;
        if (callActiveRef.current && !busyRef.current) {
          try { callRecognition.current?.start(); } catch { /* ignore browser restart race */ }
        }
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else if (callActiveRef.current) {
      callPausedRef.current = false;
      setCallStatus('listening');
      try { callRecognition.current?.start(); } catch { /* restart after response */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, attachments, busy, uploading, selected, featureOn, loadSuggestions, refreshConversations, refreshMe, toast, thinking]);

  sendRef.current = send;

  const stop = () => {
    aborts.current.forEach((a) => a.abort());
    busyRef.current = false;
    setBusy(false);
    if (callActiveRef.current) {
      callPausedRef.current = false;
      window.speechSynthesis?.cancel();
      try { callRecognition.current?.start(); } catch { /* resume recognition */ }
    }
  };

  async function enhancePrompt() {
    if (!input.trim() || enhancing || busy || uploading) return;
    setEnhancing(true);
    try {
      const result = await api<{ prompt: string }>('/api/prompt/enhance', 'POST', { prompt: input });
      setInput(result.prompt);
      toast('Prompt enhanced. Review it before sending.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not enhance prompt', 'err');
    } finally { setEnhancing(false); }
  }

  function toggleVoiceCall() {
    if (callActive) { setCallActive(false); return; }
    if (!createSpeechRecognition() || typeof window === 'undefined' || !window.speechSynthesis) {
      toast('Voice call needs browser speech recognition and speech synthesis. Try Chrome over HTTPS.', 'info');
      return;
    }
    setCallActive(true);
    toast('Voice call is starting. Speak after the microphone begins listening.', 'info');
  }

  const onQuizCreated = (r: QuizCreated) => {
    if (!convRef.current) { convRef.current = r.conversationId; window.history.replaceState(null, '', '/chat/' + r.conversationId); }
    setMessages((ms) => [...ms, { id: r.messageId ?? crypto.randomUUID(), role: 'assistant', content: r.content, meta: { kind: 'quiz', quiz_id: r.quizId } }]);
    setQuizDlg(null); setSuggestions([]); stick.current = true;
    refreshConversations();
  };

  const lastGroup = groups[groups.length - 1];
  const quizOn = featureOn('quiz');

  const empty = messages.length === 0 && !loadingChat;

  return (
    <>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-5 pt-3">
          {loadingChat && <div className="mx-auto w-full max-w-3xl space-y-4 pt-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>}
          {empty && (
            <EmptyState onSend={send} />
          )}
          <div className="space-y-7">
            {groups.map((g) => <TurnView key={g.key} group={g} names={names} onAsk={send} onEdit={(text) => { setInput(text); toast('Prompt copied to the composer. Edit it, then send.', 'info'); }} onNewQuiz={(topic) => setQuizDlg({ topic })} />)}
            {!busy && lastGroup && (suggestions.length > 0 || sugLoading) && (
              <Suggestions items={suggestions} loading={sugLoading} onPick={send} />
            )}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <Composer value={input} onChange={setInput} onSend={() => send()} onStop={stop} busy={busy} uploading={uploading}
          attachments={attachments} onAttachmentsChange={setAttachments} onUploadingChange={setUploading}
          features={features} onQuiz={quizOn ? () => setQuizDlg({}) : undefined}
          modelSlot={<>
            <button type="button" onClick={openSidebar} className="btn-ghost h-8 w-8 shrink-0 !p-0 lg:hidden" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
            {modelsLoading ? <div className="h-7 w-48 animate-pulse rounded-full bg-muted" /> : <ModelBar models={models} selected={selected} onToggle={toggle} max={maxParallel} disabled={busy} />}
          </>}
          thinking={thinking} onThinkingChange={setThinking} onEnhance={enhancePrompt} enhancing={enhancing}
          onBuildWebsite={() => setWebsiteBuilderOpen(true)} callActive={callActive} callStatus={callStatus} onToggleCall={toggleVoiceCall}
          onUnavailable={(f) => toast(f.state === 'active' ? (f.label + ': this chat action is not available yet.') : (f.label + ' is coming soon'), 'info')} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">AI can make mistakes. Please double-check important information.</p>
      </div>

      <QuizDialog open={!!quizDlg} onClose={() => setQuizDlg(null)} conversationId={convRef.current}
        defaultTopic={quizDlg?.topic} context={quizDlg?.context} onCreated={onQuizCreated} key={quizDlg?.topic ?? 'new'} />
      <WebsiteBuilderDialog open={websiteBuilderOpen} onClose={() => setWebsiteBuilderOpen(false)} models={models} preferredModel={selected[0]} />
    </>
  );
}
