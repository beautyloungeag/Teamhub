import test from 'node:test'
import assert from 'node:assert/strict'
import { clockResult } from '../supabase/functions/timebutler/clock-result.ts'

test('successful stop without content uses readback and does not report a failure', async () => {
  let reads = 0
  const r = await clockResult(204, null, async () => { reads++; return { status: 'idle' } })
  assert.deepEqual(r, { ok: true, status: 204, clock: { status: 'idle' }, error: null })
  assert.equal(reads, 1)
})
test('returned clock state avoids another read; rejected action remains rejected', async () => {
  assert.deepEqual(await clockResult(200, { status: 'running' }, async () => { throw Error('unexpected read') }), { ok: true, status: 200, clock: { status: 'running' }, error: null })
  assert.deepEqual(await clockResult(409, { message: 'already stopped' }, async () => ({ status: 'idle' })), { ok: false, status: 409, clock: { status: 'idle' }, error: 'already stopped' })
})
