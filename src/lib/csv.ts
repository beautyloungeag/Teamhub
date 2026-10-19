// CSV-Export für Excel (Schweiz): Semikolon, UTF-8 mit BOM, Werte in Anführungszeichen.
export type Row = Record<string, string | number | boolean | null | undefined>

const cell = (v: Row[string]) => {
  const s = v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'ja' : 'nein') : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Row[], columns?: string[]) {
  const cols = columns ?? [...new Set(rows.flatMap(r => Object.keys(r)))]
  return [cols.map(cell).join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\r\n')
}

export function downloadCsv(name: string, rows: Row[], columns?: string[]) {
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name.replace(/[^\w.\-äöüÄÖÜ ]+/g, '_') + (name.endsWith('.csv') ? '' : '.csv')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
