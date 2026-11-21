import 'server-only';
import { randomUUID } from 'crypto';
import { adminClient } from '@/lib/supabase/admin';
import { putObject, readObject, deleteObject, signedDownloadUrl } from '@/lib/storage/b2';
import { canonicalAttachment, verifyAttachment, type AttachmentAsset } from '@/lib/attachments';
import { sanitizeFilename, validateDeclaration } from '@/lib/attachment-validation';
import { HttpError } from '@/lib/http';

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

/** Owner-only even for admins. Generated ready assets remain downloadable; quarantine never is. */
export async function loadOwnedMedia(id: string, userId: string): Promise<AttachmentAsset> {
  const { data, error } = await adminClient().from('media_assets')
    .select('id,user_id,status,storage_key,mime,kind,size_bytes,meta').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'File not found');
  return data as AttachmentAsset;
}

/** Publish exactly the validated buffer under a new key. A replayed PUT can only change quarantine. */
export async function finalizeUpload(id: string, userId: string, maxBytes: number) {
  const asset = await loadOwnedMedia(id, userId);
  if (asset.status === 'ready') return canonicalAttachment(asset); // idempotent retry
  if (asset.status !== 'pending' || !asset.storage_key.startsWith(`staging/${userId}/`))
    throw new HttpError(404, 'Upload not found');
  let type;
  try { type = validateDeclaration(asset.mime, asset.size_bytes, maxBytes); }
  catch (e) { throw new HttpError(400, e instanceof Error ? e.message : 'Invalid upload'); }
  let bytes: Buffer;
  try {
    bytes = await readObject(asset.storage_key, asset.size_bytes, asset.mime, maxBytes);
    verifyAttachment(bytes, asset.mime, asset.size_bytes, maxBytes);
  } catch (e) {
    // Another finalizer may have published and removed staging while this request was reading it.
    const current = await loadOwnedMedia(id, userId);
    if (current.status === 'ready') return canonicalAttachment(current);
    throw e;
  }
  const key = `attachments/${userId}/${randomUUID()}.${type.ext}`;
  await putObject(key, bytes, asset.mime);
  const meta = { name: sanitizeFilename(asset.meta?.name ?? `attachment.${type.ext}`), attachment_verified: true };
  const { data, error } = await adminClient().from('media_assets')
    .update({ status: 'ready', storage_key: key, kind: type.kind, mime: asset.mime, size_bytes: bytes.length, meta })
    .eq('id', id).eq('user_id', userId).eq('status', 'pending').eq('storage_key', asset.storage_key)
    .select('id,user_id,status,storage_key,mime,kind,size_bytes,meta').maybeSingle();
  // On a network/database error the write outcome may be unknown. Never delete a possibly-published object.
  if (error) throw error;
  if (!data) {
    await deleteObject(key).catch(() => undefined); // confirmed loser; its unique key cannot be referenced
    const winner = await loadOwnedMedia(id, userId);
    if (winner.status === 'ready') return canonicalAttachment(winner);
    throw new HttpError(409, 'Upload changed during finalization; please retry');
  }
  await deleteObject(asset.storage_key).catch(() => undefined);
  return canonicalAttachment(data as AttachmentAsset);
}

/** Decode a `data:image/png;base64,....` URL. */
export function parseDataUrl(u: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(u);
  return m ? { mime: m[1], buffer: Buffer.from(m[2], 'base64') } : null;
}
