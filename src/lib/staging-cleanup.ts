import 'server-only';

import { adminClient } from '@/lib/supabase/admin';
import { deleteObject } from '@/lib/storage/b2';

/**
 * Remove only abandoned quarantine uploads. Browser upload capabilities expire
 * after five minutes; the 24-hour grace period keeps interrupted sessions safe.
 * Ready/published assets are never selected or touched.
 */
export async function cleanupAbandonedUploads() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const db = adminClient();
  const { data: rows, error } = await db.from('media_assets')
    .select('id,user_id,storage_key')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .like('storage_key', 'staging/%')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;

  let deleted = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    if (typeof row.user_id !== 'string' || typeof row.storage_key !== 'string' ||
        !row.storage_key.startsWith('staging/' + row.user_id + '/')) {
      failed++;
      continue;
    }
    try {
      await deleteObject(row.storage_key);
      const result = await db.from('media_assets').delete()
        .eq('id', row.id)
        .eq('user_id', row.user_id)
        .eq('status', 'pending')
        .eq('storage_key', row.storage_key)
        .select('id');
      if (result.error) throw result.error;
      if ((result.data ?? []).length) deleted++;
    } catch (cause) {
      failed++;
      console.warn('[staging-cleanup] Could not remove abandoned upload:', {
        assetId: row.id,
        error: cause instanceof Error ? cause.message : 'Unknown cleanup error',
      });
    }
  }
  return { scanned: rows?.length ?? 0, deleted, failed, olderThanHours: 24 };
}
