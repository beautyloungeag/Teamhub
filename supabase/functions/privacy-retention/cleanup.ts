import { CONTEXT_BUCKET } from '../assistant/privacy-context.ts'
export async function runCleanup(db: any) {
  const { data: batch, error } = await db.rpc('privacy_retention_batch')
  if (error) throw new Error('retention_database_failed')
  if (!batch?.enabled) return { ...batch, files_deleted: 0, files_failed: 0 }
  const { data: files, error: queueError } = await db.from('privacy_storage_deletions').select('id,path').order('id').limit(100)
  if (queueError) throw new Error('retention_queue_failed')
  let deleted = 0, failed = 0
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  for (const file of files ?? []) {
    if (!new RegExp(`^${uuid}/${uuid}/${uuid}\\.json$`, 'i').test(file.path)) { failed++; continue }
    const { error: removeError } = await db.storage.from(CONTEXT_BUCKET).remove([file.path])
    if (removeError) { failed++; continue }
    const { error: ackError } = await db.from('privacy_storage_deletions').delete().eq('id', file.id)
    if (ackError) failed++
    else deleted++
  }
  return { ...batch, files_deleted: deleted, files_failed: failed }
}
