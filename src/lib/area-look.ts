// Zeichen und Farbe eines Wissens-Bereichs (seit 28.10. pflegt das Büro die Bereiche selbst, Tabelle wiki_areas)
import { BookOpen, Briefcase, GraduationCap, Heart, KeyRound, LayoutGrid, Megaphone, ShieldAlert, Sparkles, Star, Users, Wrench } from 'lucide-react'
import { AREAS } from './wiki'
import type { Tone } from '../tones'

export const AREA_ICONS = { sparkles: Sparkles, shield: ShieldAlert, layout: LayoutGrid, users: Users, graduation: GraduationCap, key: KeyRound, book: BookOpen, briefcase: Briefcase, heart: Heart, megaphone: Megaphone, star: Star, wrench: Wrench } as const
export type AreaIcon = keyof typeof AREA_ICONS
export const AREA_TONES: Tone[] = ['learn', 'duty', 'note', 'plum', 'done', 'studio']
export function areaLook(key: string): { tone: Tone; icon: typeof Sparkles } {
  const a = AREAS.find(x => x.key === key) ?? AREAS[0]
  const tone = (AREA_TONES as string[]).includes(a?.tone ?? '') ? a.tone as Tone : 'note'
  return { tone, icon: AREA_ICONS[(a?.icon ?? 'layout') as AreaIcon] ?? LayoutGrid }
}
