// Stundensaldo über die Timebutler-API v1 (Firmen-Token, Matteo 29.10.: „Stundensaldo in der App“).
// v2 kennt keinen Saldo; v1 liefert ihn als CSV für alle Nutzer: `worktimeaccountbalance` = Ansicht
// „Überstundenguthaben zum Stichtag“, höchstens 12 Abrufe je Kalendertag. Doku: https://app.timebutler.com/do?ha=api&ac=10&lang=de
// Reine Funktionen ohne Netz, damit sie sich mit node --test prüfen lassen.

/** CSV mit Semikolon, Felder optional in Anführungszeichen ("" = ein Zeichen) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim())) rows.push(row)
  return rows.map(r => r.map(c => c.trim()))
}

/** Spalte mit dem Endsaldo: laut Timebutler die letzte, „Überstundenguthaben zum TT.MM.JJJJ“ / „Overtime balance as of …“ */
export function balanceColumn(header: string[]): number {
  const h = header.map(x => x.toLowerCase())
  for (let i = h.length - 1; i > 0; i--) if (/(overtime balance|überstunden(guthaben|stand|saldo)|guthaben zum|stand zum)/.test(h[i])) return i
  for (let i = h.length - 1; i > 0; i--) if (/(saldo|balance)/.test(h[i])) return i
  return h.length - 1
}

/** Wert in Minuten: mit minutes=true „450“ / „-90“, sonst Industriestunden „7.5 h“ / „-1,25 h“ */
export function minutesOf(v: string): number | null {
  const s = v.replace(/\s/g, '').replace(/[’']/g, '').replace('−', '-')
  if (!s) return null
  const hours = /h$/i.test(s)
  const n = Number(s.replace(/h$/i, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return Math.round(hours ? n * 60 : n)
}

export type BalanceRow = { userid: string; minutes: number | null; row: Record<string, string> }
/** Antwort von worktimeaccountbalance → je Nutzer Saldo in Minuten plus die ganze Zeile (Spaltenname → Wert) */
export function parseBalances(csv: string): { header: string[]; rows: BalanceRow[] } {
  const [header = [], ...data] = parseCsv(csv)
  const col = balanceColumn(header)
  return {
    header,
    rows: data.filter(r => r[0]).map(r => ({
      userid: r[0], minutes: minutesOf(r[col] ?? ''),
      row: Object.fromEntries(header.map((h, i) => [h || `Spalte ${i + 1}`, r[i] ?? ''])),
    })),
  }
}

/** Antwort von users → userid je E-Mail (klein geschrieben); Spalten laut Doku: User ID, Last name, First name, Employee number, E-mail address, … */
export function usersByEmail(csv: string): Map<string, string> {
  const [header = [], ...data] = parseCsv(csv)
  const at = header.findIndex(h => /e-?mail/i.test(h))
  const col = at >= 0 ? at : 4
  return new Map(data.filter(r => r[0] && r[col]).map(r => [r[col].toLowerCase(), r[0]]))
}
