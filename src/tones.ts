// Farben nach Wichtigkeit (Richtung B, 21.10.): Pflicht rot, Wichtig/Aktion Messing, Learning Blau, Studio Olive, Erledigt Grün
export type Tone = 'duty' | 'note' | 'learn' | 'studio' | 'done' | 'plum'
export const TONE: Record<Tone, { fg: string; bg: string; solid: string }> = {
  duty: { fg: 'text-duty', bg: 'bg-duty-50', solid: 'bg-duty' },
  note: { fg: 'text-note', bg: 'bg-note-50', solid: 'bg-note' },
  learn: { fg: 'text-learn', bg: 'bg-learn-50', solid: 'bg-learn' },
  studio: { fg: 'text-studio', bg: 'bg-studio-50', solid: 'bg-studio' },
  done: { fg: 'text-done', bg: 'bg-done-50', solid: 'bg-done' },
  plum: { fg: 'text-plum', bg: 'bg-plum-50', solid: 'bg-plum' },
}
/** Ton einer News oder eines Wissens-Themas aus Tag/Name ableiten. */
export const toneOf = (label: string, mustRead = false): Tone =>
  mustRead || /pflicht|hygiene|sicherheit|wichtig/i.test(label) ? 'duty'
    : /schul|learn|quiz|video|ausbild|lehre|onboard|praktik/i.test(label) ? 'learn'
    : /marketing|aktion|gutschein|verkauf|kasse/i.test(label) ? 'note'
    : /team|hr|mitarbeit|lohn|frei|arbeitszeit/i.test(label) ? 'plum'
    : 'studio'
/** Kacheln abwechselnd einfärben; Pflicht-Themen (Hygiene, Sicherheit) bleiben rot. */
const ROTATE: Tone[] = ['studio', 'note', 'learn', 'plum', 'done']
export const tileTone = (label: string, i: number): Tone => toneOf(label) === 'duty' ? 'duty' : ROTATE[i % ROTATE.length]
