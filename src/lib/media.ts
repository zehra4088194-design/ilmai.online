import 'server-only';
import { randomUUID } from 'crypto';
import { adminClient } from '@/lib/supabase/admin';
import { putObject, signedDownloadUrl } from '@/lib/storage/b2';

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'pptx' | 'docx' | 'file';

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/** Upload bytes to B2 and record them in media_assets. Used by image / video / presentation / test generators. */
export async function saveMedia(input: {
  userId: string;
  kind: MediaKind;
  body: Buffer;
  mime: string;
  prompt?: string;
  model?: string;
  meta?: Record<string, unknown>;
}) {
  const d = new Date();
  const ext = EXT[input.mime] ?? 'bin';
  const key = `${input.kind}/${input.userId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
  await putObject(key, input.body, input.mime);
  const { data, error } = await adminClient()
    .from('media_assets')
    .insert({
      user_id: input.userId, kind: input.kind, storage_key: key, mime: input.mime,
      size_bytes: input.body.length, prompt: input.prompt ?? null, model: input.model ?? null, meta: input.meta ?? {},
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, url: await signedDownloadUrl(key) } as { id: string; storage_key: string; url: string; kind: MediaKind; mime: string };
}

/** Decode a `data:image/png;base64,....` URL. */
export function parseDataUrl(u: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u);
  return m ? { mime: m[1], buffer: Buffer.from(m[2], 'base64') } : null;
}
