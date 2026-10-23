// Timebutler documents 204 as a successful stop with no response body.
export async function clockResult(status: number, body: unknown, readStatus: () => Promise<unknown>) {
  const ok = status >= 200 && status < 300
  return {
    ok, status,
    clock: ok && body && typeof body === 'object' && 'status' in body ? body : await readStatus(),
    error: ok ? null : body && typeof body === 'object' && 'message' in body ? body.message : null,
  }
}
