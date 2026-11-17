// Wann gilt eine Checkliste? Eine Regel für App, Backoffice, Marc und Erinnerungen.
// Kopie in supabase/functions/_shared/recurrence.ts (Test prüft Gleichheit).
// Seit 17.11.2026 (Renée): mehrere Wochentage je Woche und „alle X Tage“.

export type Repeat = 'daily' | 'weekly' | 'monthly' | 'interval'
export type Rule = {
  repeat: Repeat | string
  weekday?: number | null
  weekdays?: number[] | null
  monthday?: number | null
  everyDays?: number | null
  startDay?: string | null
}

// ISO-Wochentag, 1 = Montag … 7 = Sonntag
export const isoDow = (day: string) => ((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1

// Kalendertage zwischen zwei Tagen (YYYY-MM-DD), unabhängig von der Zeitumstellung
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5)

export const weekdaysOf = (r: Rule): number[] => {
  const list = (r.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  if (list.length) return [...new Set(list)].sort((a, b) => a - b)
  return r.weekday ? [r.weekday] : [1]
}

export function dueOn(r: Rule, day: string): boolean {
  if (r.repeat === 'daily') return true
  if (r.repeat === 'weekly') return weekdaysOf(r).includes(isoDow(day))
  if (r.repeat === 'monthly') {
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate()
    return Math.min(r.monthday ?? 1, last) === Number(day.slice(8, 10))
  }
  if (r.repeat === 'interval') {
    const n = Math.max(2, Math.round(Number(r.everyDays) || 2))
    if (!r.startDay) return false
    const d = daysBetween(r.startDay, day)
    return d >= 0 && d % n === 0
  }
  return false
}
