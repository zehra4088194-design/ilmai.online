import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { getModel, getAllTextModels, canUseTier, type ModelInfo } from '@/lib/models';
import { getMode } from '@/lib/modes';
import { buildSystemPrompt } from '@/lib/prompt';
import { buildHistory } from '@/lib/history';
import type { ChatMessage } from '@/lib/openrouter';
import { aiRouterFetch, type RouterCandidate } from '@/lib/ai-router';
import { adminClient } from '@/lib/supabase/admin';
import { AttachmentIds, attachmentContent } from '@/lib/attachments';
import { creditsFor, addCredits } from '@/lib/credits';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().uuid(),
  userMessageId: z.string().uuid(),
  model: z.string().min(3).max(200),
  multi: z.boolean().optional(),
});

type Row = { id: string; role: 'user' | 'assistant' | 'system'; content: string; model: string | null; meta: { kind?: string } | null };

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const body = Body.parse(await req.json());
  const settings = await getSettings();

  if (settings.maintenance_mode && !isAdmin)
    throw new HttpError(503, 'Ilm AI is under maintenance. Please try again soon.', 'maintenance');

  await requireFeature('text_chat', profile.plan, isAdmin);
  if (body.multi) await requireFeature('compare_models', profile.plan, isAdmin);

  const autoMode = body.model === 'auto';
  const allTextModels = autoMode ? await getAllTextModels() : [];
  let autoCandidates: ModelInfo[] = autoMode
    ? allTextModels.filter((candidate) =>
        (isAdmin || candidate.enabled) &&
        (isAdmin || canUseTier(profile.plan, candidate.tier))
      )
    : [];
  if (autoMode && !autoCandidates.length)
    throw new HttpError(503, 'No enabled models are available for Auto routing', 'auto_models_unavailable');
  let model = autoMode ? autoCandidates[0] : await getModel(body.model);
  if (!model || (!model.enabled && !isAdmin)) throw new HttpError(400, 'This model is not available', 'model_unavailable');
  if (!isAdmin && !canUseTier(profile.plan, model.tier)) throw new HttpError(403, 'This model needs the ' + model.tier + ' plan', 'plan_required');
  if (!isAdmin && profile.credits_balance <= 0) throw new HttpError(402, 'You are out of credits', 'out_of_credits');

  const db = adminClient();
  const { data: conv } = await db.from('conversations').select('id,mode').eq('id', body.conversationId).eq('user_id', profile.id).maybeSingle();
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const { data: userMsg } = await db.from('messages').select('id,content,attachments,created_at')
    .eq('id', body.userMessageId).eq('conversation_id', conv.id).eq('user_id', profile.id).eq('role', 'user').maybeSingle();
  if (!userMsg) throw new HttpError(404, 'Message not found');

  const rawAttachments = Array.isArray(userMsg.attachments) ? userMsg.attachments : [];
  const attachmentIds = AttachmentIds.parse(rawAttachments.map((item: { asset_id?: unknown }) =>
    item && typeof item === 'object' ? item.asset_id : null));
  if (attachmentIds.length) await requireFeature('file_upload', profile.plan, isAdmin);
  if (autoMode && attachmentIds.length) {
    const owned = await import('@/lib/attachments').then(({ validateAttachments }) => validateAttachments(attachmentIds, profile.id));
    const needsVision = owned.some((file) => file.kind === 'image');
    const needsDocuments = owned.some((file) => file.mime === 'application/pdf');
    autoCandidates = autoCandidates.filter((candidate) =>
      (!needsVision || candidate.vision) && (!needsDocuments || candidate.documents)
    );
    if (!autoCandidates.length) throw new HttpError(400, 'No model on your plan supports the attached image or document', 'no_capable_model');
    model = autoCandidates[0];
  }

  const turnsToKeep = Math.max(2, Math.floor(settings.max_history_messages / 2));
  const { data: rows } = await db.from('messages').select('id,role,content,model,meta')
    .eq('conversation_id', conv.id).lt('created_at', userMsg.created_at)
    .order('created_at', { ascending: false }).limit(turnsToKeep * 6);
  const history: ChatMessage[] = buildHistory(((rows ?? []) as Row[]).reverse(), model.id, turnsToKeep);
  const mode = await getMode(conv.mode);
  const currentUserContent = attachmentIds.length
    ? await attachmentContent(userMsg.content as string, attachmentIds, profile.id, { vision: model.vision, documents: model.documents })
    : userMsg.content as string;
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ settings, mode, audience: profile.audience ?? 'student', grade: profile.grade }) },
    ...history,
    { role: 'user', content: currentUserContent },
  ];

  const ac = new AbortController();
  req.signal.addEventListener('abort', () => ac.abort());
  const started = Date.now();
  const kind = body.multi ? 'compare' : 'chat';
  const candidates: RouterCandidate[] = (autoMode ? autoCandidates : [model]).slice(0, 25).map((candidate, index) => ({
    id: candidate.id, provider: 'openrouter', priority: candidate.sort + Math.round(candidate.pricePromptPerM * 10),
    modalities: [...(candidate.vision ? ['vision'] : []), ...(candidate.documents ? ['document'] : [])],
  }));
  const hints = [
    attachmentIds.length ? 'Attached files must be read; choose vision/document capable models.' : '',
    /\\b(math|mathematics|equation|integral|matrix|prove|calculate)\\b/i.test(String(userMsg.content)) ? 'Mathematics or reasoning task.' : '',
    String(userMsg.content).slice(0, 500),
  ].filter(Boolean).join(' ');
  const upstream = await aiRouterFetch({
    userId: profile.id,
    path: '/v1/chat/completions',
    body: {
      model: model.id, messages, stream: true, usage: { include: true },
      routing: { provider: autoMode ? 'auto' : 'openrouter', candidates, hints },
    },
    signal: ac.signal,
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => '');
    let msg = 'Model error (' + upstream.status + ')';
    try { const parsed = JSON.parse(t); msg = parsed?.error?.message ?? parsed?.error ?? msg; } catch { /* ignore */ }
    await logUsage({ userId: profile.id, kind, model: model.id, status: 'error', error: String(msg), latencyMs: Date.now() - started });
    throw new HttpError(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, String(msg), 'upstream_error');
  }
  let actualModel = upstream.headers.get('x-ilm-model') ?? model.id;
  const actualProvider = upstream.headers.get('x-ilm-provider') ?? 'openrouter';

  let full = '';
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null = null;
  let errMsg: string | undefined;

  const finalize = async () => {
    const pt = usage?.prompt_tokens ?? 0;
    const ct = usage?.completion_tokens ?? Math.ceil(full.length / 4);
    const cost = usage?.cost ?? 0;
    const charge = !isAdmin && (full || usage) ? creditsFor(cost, pt + ct, settings) : 0;
    if (full) {
      await db.from('messages').insert({
        conversation_id: conv.id, user_id: profile.id, role: 'assistant', content: full,
        model: actualModel, prompt_tokens: pt, completion_tokens: ct, cost_usd: cost, meta: { turn: userMsg.id, requested_model: body.model, provider: actualProvider },
      });
      await db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conv.id);
    }
    if (charge) await addCredits(profile.id, -charge, kind + ':' + actualModel).catch((e) => console.error(e));
    await logUsage({
      userId: profile.id, kind, model: actualModel, promptTokens: pt, completionTokens: ct, costUsd: cost, creditsUsed: charge,
      latencyMs: Date.now() - started, status: errMsg && !full ? 'error' : 'ok', error: errMsg,
    });
  };

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const j = JSON.parse(data);
              if (j.error) { errMsg = j.error.message ?? 'Upstream error'; controller.enqueue(enc.encode('\n\n⚠️ ' + errMsg)); continue; }
              const delta = j.choices?.[0]?.delta?.content;
              if (delta) { full += delta; controller.enqueue(enc.encode(delta)); }
              if (j.usage) usage = j.usage;
            } catch { /* partial JSON – ignore */ }
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) errMsg = e instanceof Error ? e.message : 'Stream error';
      } finally {
        try { controller.close(); } catch { /* already closed */ }
        await finalize();
      }
    },
    cancel() { ac.abort(); },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'x-ilm-model': actualModel, 'x-ilm-provider': actualProvider },
  });
});
