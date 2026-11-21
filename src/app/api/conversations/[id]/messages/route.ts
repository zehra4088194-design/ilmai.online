import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, json } from '@/lib/http';
import { requireUserApi } from '@/lib/auth';
import { requireFeature } from '@/lib/features';
import { createClient } from '@/lib/supabase/server';
import { AttachmentIds, validateAttachments } from '@/lib/attachments';
import { ATTACHMENT_PROMPT } from '@/lib/attachment-validation';

export const dynamic = 'force-dynamic';

/** Stores the user's message; the browser then calls /api/chat once per selected model. */
export const POST = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { profile, isAdmin } = await requireUserApi();
  await requireFeature('text_chat', profile.plan, isAdmin);
  const { id } = z.object({ id: z.string().uuid() }).parse(await params);
  const b = z.object({ content: z.string().max(20000).default(''), attachmentIds: AttachmentIds.optional() }).parse(await req.json());
  if (b.attachmentIds?.length) await requireFeature('file_upload', profile.plan, isAdmin);
  const attachments = await validateAttachments(b.attachmentIds ?? [], profile.id);
  const content = b.content.trim() || (attachments.length ? ATTACHMENT_PROMPT : '');
  if (!content) throw new HttpError(400, 'A message or attachment is required');
  const supabase = await createClient();
  const { data: conv } = await supabase.from('conversations').select('id').eq('id', id).maybeSingle(); // RLS: must be yours
  if (!conv) throw new HttpError(404, 'Conversation not found');
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: id, user_id: profile.id, role: 'user', content, attachments }).select('id').single();
  if (error) throw error;
  return json({ id: data.id });
});
