import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { getMode } from '@/lib/modes';
import { createClient } from '@/lib/supabase/server';
import { truncate } from '@/lib/utils';
import { AttachmentIds, validateAttachments } from '@/lib/attachments';
import { ATTACHMENT_PROMPT } from '@/lib/attachment-validation';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireUserApi();
  const supabase = await createClient(); // RLS: only own rows
  const { data, error } = await supabase
    .from('conversations').select('id,title,model,mode,pinned,folder_id,updated_at')
    .eq('archived', false).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(200);
  if (error) throw error;
  return json({ conversations: data });
});

const Body = z.object({
  title: z.string().max(120).optional(),
  model: z.string().max(200).optional(),
  mode: z.string().max(60).nullable().optional(),
  firstMessage: z.string().max(20000).optional(),
  attachmentIds: AttachmentIds.optional(),
});

/** Creates a conversation (and optionally its first user message in one go). */
export const POST = handle(async (req: NextRequest) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('text_chat', profile.plan, isAdmin);
  const b = Body.parse(await req.json());
  if (b.attachmentIds?.length) await requireFeature('file_upload', profile.plan, isAdmin);
  const attachments = await validateAttachments(b.attachmentIds ?? [], profile.id);
  const content = b.firstMessage?.trim() || (attachments.length ? ATTACHMENT_PROMPT : '');
  const mode = await getMode(b.mode);
  const supabase = await createClient();
  const title = b.title ?? (content ? truncate(content.replace(/\s+/g, ' '), 60) : 'New chat');
  const { data: conv, error } = await supabase.from('conversations')
    .insert({ user_id: profile.id, title, model: b.model ?? null, mode: mode?.slug ?? null }).select('id').single();
  if (error) throw error;
  let userMessageId: string | undefined;
  if (content) {
    const { data: m, error: e2 } = await supabase.from('messages')
      .insert({ conversation_id: conv.id, user_id: profile.id, role: 'user', content, attachments }).select('id').single();
    if (e2) throw e2;
    userMessageId = m.id;
  }
  return json({ id: conv.id, userMessageId });
});
