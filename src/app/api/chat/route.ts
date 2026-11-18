import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getSettings } from '@/lib/settings';
import { getModel, canUseTier } from '@/lib/models';
import { orStream, type ChatMessage } from '@/lib/openrouter';
import { adminClient } from '@/lib/supabase/admin';
import { creditsFor, addCredits } from '@/lib/credits';
import { logUsage } from '@/lib/usage';
import { truncate } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().uuid().optional(),
  model: z.string().min(3).max(200),
  message: z.string().min(1).max(20000),
  /** compare mode: nothing is saved, history is supplied by the client */
  ephemeral: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(50000) })).max(40).optional(),
});

export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  const body = Body.parse(await req.json());
  const settings = await getSettings();

  if (settings.maintenance_mode && !isAdmin)
    throw new HttpError(503, 'Ilm AI is under maintenance. Please try again soon.', 'maintenance');

  await requireFeature(body.ephemeral ? 'compare_models' : 'text_chat', profile.plan, isAdmin);

  const model = await getModel(body.model);
  if (!model || (!model.enabled && !isAdmin)) throw new HttpError(400, 'This model is not available', 'model_unavailable');
  if (!isAdmin && !canUseTier(profile.plan, model.tier))
    throw new HttpError(403, `This model needs the ${model.tier} plan`, 'plan_required');
  if (!isAdmin && profile.credits_balance <= 0) throw new HttpError(402, 'You are out of credits', 'out_of_credits');

  const db = adminClient();
  let conversationId: string | null = body.conversationId ?? null;
  let history: ChatMessage[] = [];

  if (body.ephemeral) {
    history = body.history ?? [];
  } else {
    if (conversationId) {
      const { data: conv } = await db.from('conversations').select('id').eq('id', conversationId).eq('user_id', profile.id).maybeSingle();
      if (!conv) throw new HttpError(404, 'Conversation not found');
      const { data: rows } = await db
        .from('messages').select('role,content').eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(settings.max_history_messages);
      history = (rows ?? []).reverse().map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content as string }));
    } else {
      const { data: conv, error } = await db
        .from('conversations')
        .insert({ user_id: profile.id, title: truncate(body.message.replace(/\s+/g, ' ').trim(), 60), model: model.id })
        .select('id').single();
      if (error) throw error;
      conversationId = conv.id as string;
    }
    await db.from('messages').insert({ conversation_id: conversationId, user_id: profile.id, role: 'user', content: body.message });
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: settings.system_prompt },
    ...history,
    { role: 'user', content: body.message },
  ];

  const ac = new AbortController();
  req.signal.addEventListener('abort', () => ac.abort());
  const started = Date.now();

  const upstream = await orStream({ model: model.id, messages }, ac.signal);
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => '');
    let msg = `Model error (${upstream.status})`;
    try { msg = JSON.parse(t)?.error?.message ?? msg; } catch { /* ignore */ }
    await logUsage({ userId: profile.id, kind: body.ephemeral ? 'compare' : 'chat', model: model.id, status: 'error', error: msg, latencyMs: Date.now() - started });
    throw new HttpError(502, msg, 'upstream_error');
  }

  let full = '';
  let usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null = null;
  let errMsg: string | undefined;

  const finalize = async () => {
    const pt = usage?.prompt_tokens ?? 0;
    const ct = usage?.completion_tokens ?? Math.ceil(full.length / 4);
    const cost = usage?.cost ?? 0;
    const charge = !isAdmin && (full || usage) ? creditsFor(cost, pt + ct, settings) : 0;
    if (!body.ephemeral && full && conversationId) {
      await db.from('messages').insert({
        conversation_id: conversationId, user_id: profile.id, role: 'assistant', content: full,
        model: model.id, prompt_tokens: pt, completion_tokens: ct, cost_usd: cost,
      });
      await db.from('conversations').update({ updated_at: new Date().toISOString(), model: model.id }).eq('id', conversationId);
    }
    if (charge) await addCredits(profile.id, -charge, `${body.ephemeral ? 'compare' : 'chat'}:${model.id}`).catch((e) => console.error(e));
    await logUsage({
      userId: profile.id, kind: body.ephemeral ? 'compare' : 'chat', model: model.id,
      promptTokens: pt, completionTokens: ct, costUsd: cost, creditsUsed: charge,
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue; // skips ": OPENROUTER PROCESSING" keep-alives
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const j = JSON.parse(data);
              if (j.error) {
                errMsg = j.error.message ?? 'Upstream error';
                controller.enqueue(enc.encode(`\n\n⚠️ ${errMsg}`));
                continue;
              }
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
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Conversation-Id': conversationId ?? '',
    },
  });
});
