export type ChatMessage = { id: string; room_id: string; sender_id: string; body: string; created_at: string; photo_path?: string | null }
type Change = { seq: number; kind: 'upsert'; message: ChatMessage } | { seq: number; kind: 'delete'; id: string }

const sorted = (rows: Iterable<ChatMessage>) => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(-200)

/** A snapshot replaces old history, then changes received during its request
 * are replayed. Thus an older HTTP response cannot erase a new websocket row. */
export class ChatTimeline {
  private sequence = 0
  private changes: Change[] = []
  private rows: ChatMessage[] | null = null
  beginSnapshot() { return this.sequence }
  get messages() { return this.rows }
  upsert(message: ChatMessage) {
    this.changes.push({ seq: ++this.sequence, kind: 'upsert', message })
    if (this.rows) this.rows = sorted(new Map([...this.rows, message].map(row => [row.id, row])).values())
    return this.rows
  }
  remove(id: string) {
    this.changes.push({ seq: ++this.sequence, kind: 'delete', id })
    if (this.rows) this.rows = this.rows.filter(row => row.id !== id)
    return this.rows
  }
  acceptSnapshot(snapshot: ChatMessage[], startedAt: number) {
    const rows = new Map(snapshot.map(row => [row.id, row]))
    for (const change of this.changes) if (change.seq > startedAt) {
      if (change.kind === 'delete') rows.delete(change.id)
      else rows.set(change.message.id, change.message)
    }
    this.rows = sorted(rows.values())
    this.changes = []
    return this.rows
  }
}
