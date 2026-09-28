// Beispieldaten für die Feedback-Runde. Echte Inhalte folgen aus BLTH-10 / Phorest / Timebutler.
export const BRANCHES = ['Basel 1', 'Basel 2', 'Reinach', 'Oberwil', 'Riehen', 'Pratteln', 'Büro']
export const SKILL_CATALOG = ['Gesichtsbehandlung', 'Lashlifting', 'Brow-Styling', 'Waxing', 'Intimwaxing', 'Maniküre', 'Shellac', 'Pediküre', 'Massage', 'Microneedling', 'Studioleitung', 'Berufsbildung']

export type News = { id: number; title: string; teaser: string; body: string; author: string; date: string; tag: string; mustRead: boolean; audience: string; scheduled?: string; toWiki?: boolean }
export const NEWS: News[] = [
  { id: 1, title: 'Neue Hygienerichtlinie ab 1. Oktober', teaser: 'Liegen werden jetzt nach jeder Behandlung desinfiziert, nicht mehr stündlich.', body: 'Ab dem 1. Oktober gilt in allen Studios die überarbeitete Hygienerichtlinie. Die wichtigste Änderung: Liegen und Kopfstützen werden nach jeder Behandlung desinfiziert. Die Checkliste in euren Tagesaufgaben ist bereits angepasst.\n\nDie komplette Richtlinie steht im Wissen unter „Hygiene“. Bitte lest sie und bestätigt hier.', author: 'Renée Meier', date: 'Heute, 08:12', tag: 'Pflicht', mustRead: true, audience: 'Alle Studios', toWiki: true },
  { id: 2, title: 'Trainee-Behandlungen wieder buchbar', teaser: 'Die Sonderangebote für Trainee-Behandlungen sind reaktiviert.', body: 'Die Trainee-Angebote sind in Phorest wieder aktiv und online buchbar. Bitte prüft bei euren Trainees, dass die Zuteilung stimmt.', author: 'Renée Meier', date: 'Gestern', tag: 'Studio', mustRead: false, audience: 'Respos' },
  { id: 3, title: 'Herbstaktion Lashlifting', teaser: 'Vom 5. bis 31. Oktober 15 % auf Lashlifting mit Färben.', body: 'Unsere Herbstaktion startet am 5. Oktober. Die Aufsteller kommen nächste Woche in die Studios. Fragen gerne an Eva.', author: 'Eva Huber', date: 'Di, 22.09.', tag: 'Marketing', mustRead: false, audience: 'Alle Studios' },
  { id: 4, title: 'Teamabend im November', teaser: 'Save the Date: Freitag, 20. November. Anmeldung im Kalender.', body: 'Wir feiern gemeinsam das Jahr. Details und Anmeldung findet ihr im Kalender.', author: 'Cora Keller', date: 'Mo, 21.09.', tag: 'Team', mustRead: false, audience: 'Alle' },
]

export type Task = { id: number; title: string; time: string; group: string; prio?: boolean; proof?: 'foto' }
export const TASKS: Task[] = [
  { id: 1, title: 'Studio aufschliessen, Licht und Musik an', time: '07:45', group: 'Öffnung' },
  { id: 2, title: 'Kabinen 1–3 desinfizieren', time: '07:50', group: 'Öffnung', prio: true, proof: 'foto' },
  { id: 3, title: 'Wachs erwärmen, Temperatur prüfen', time: '07:55', group: 'Öffnung' },
  { id: 4, title: 'Handtücher auffüllen', time: '12:00', group: 'Mittag' },
  { id: 5, title: 'Kühlschrank-Temperatur eintragen', time: '12:00', group: 'Mittag', prio: true },
  { id: 6, title: 'Wäsche in die Maschine', time: '17:30', group: 'Schliessung' },
  { id: 7, title: 'Kasse abschliessen', time: '18:00', group: 'Schliessung', prio: true },
  { id: 8, title: 'Liegen und Böden reinigen', time: '18:05', group: 'Schliessung', proof: 'foto' },
]
export const TASK_TEMPLATES = [
  { name: 'Öffnung', items: 3, repeat: 'Täglich', branches: 'Alle Studios' },
  { name: 'Mittag', items: 2, repeat: 'Täglich', branches: 'Alle Studios' },
  { name: 'Schliessung', items: 3, repeat: 'Täglich', branches: 'Alle Studios' },
  { name: 'Wochenputz', items: 6, repeat: 'Jeden Montag', branches: 'Alle Studios' },
  { name: 'Inventur Produkte', items: 4, repeat: 'Monatlich, 1.', branches: 'Alle Studios' },
]
export const BRANCH_PROGRESS = [
  { branch: 'Basel 1', done: 8, total: 8 }, { branch: 'Basel 2', done: 6, total: 8 }, { branch: 'Reinach', done: 5, total: 8 },
  { branch: 'Oberwil', done: 8, total: 8 }, { branch: 'Riehen', done: 3, total: 8 }, { branch: 'Pratteln', done: 3, total: 8 },
]

export type Appt = { time: string; end: string; client: string; service: string; note?: string; room: string }
export const APPTS: Appt[] = [
  { time: '08:30', end: '09:30', client: 'Rita M.', service: 'Gesichtsbehandlung Classic', room: 'Kabine 1' },
  { time: '09:45', end: '10:15', client: 'Valentina G.', service: 'Maniküre mit Shellac', note: 'Wünscht Nude-Töne', room: 'Kabine 2' },
  { time: '10:30', end: '11:15', client: 'Kundin A.', service: 'Pediküre', room: 'Kabine 2' },
  { time: '13:00', end: '13:45', client: 'Kundin B.', service: 'Lashlifting mit Färben', note: 'Erstbesuch', room: 'Kabine 1' },
  { time: '14:00', end: '14:30', client: 'Selina C.', service: 'Waxing Beine komplett', room: 'Kabine 3' },
  { time: '15:00', end: '16:00', client: 'Kundin C.', service: 'Gesichtsbehandlung Deluxe', room: 'Kabine 1' },
]
export const WEEK = [
  { d: 'Mo', n: 21, shift: '08:00–17:00' }, { d: 'Di', n: 22, shift: '12:00–20:00' }, { d: 'Mi', n: 23, shift: 'Berufsschule' },
  { d: 'Do', n: 24, shift: '08:00–17:00' }, { d: 'Fr', n: 25, shift: '08:00–17:00' }, { d: 'Sa', n: 26, shift: '09:00–15:00' }, { d: 'So', n: 27, shift: 'Frei' },
]
export const TEAM_TODAY = [
  { name: 'Alma Muster', shift: '09:00–18:00', appts: 7 },
  { name: 'Bea Beispiel', shift: '08:00–17:00', appts: 6 },
  { name: 'Lernende 2. Jahr', shift: '08:00–17:00', appts: 3 },
]

export type WikiArticle = { id: number; cat: string; title: string; minutes: number; updated: string; body: string[]; video?: boolean }
export const WIKI: WikiArticle[] = [
  { id: 1, cat: 'Hygiene', title: 'Desinfektion nach jeder Behandlung', minutes: 4, updated: '24.09.2026', video: true, body: ['Nach jeder Behandlung werden Liege, Kopfstütze, Arbeitsfläche und Instrumente gereinigt.', '1. Einwegauflage entfernen und entsorgen.', '2. Flächen mit Desinfektionsmittel einsprühen, 60 Sekunden einwirken lassen.', '3. Mit frischem Tuch nachwischen, neue Auflage auflegen.', 'Instrumente kommen ins Ultraschallbad und anschliessend in den Sterilisator.'] },
  { id: 2, cat: 'Hygiene', title: 'Umgang mit Wachs und Spateln', minutes: 3, updated: '12.09.2026', body: ['Spatel nie zweimal ins Wachs tauchen.', 'Wachstemperatur vor jeder Kundin am Handgelenk prüfen.'] },
  { id: 3, cat: 'Behandlungen', title: 'Lashlifting Schritt für Schritt', minutes: 8, updated: '02.09.2026', video: true, body: ['Ablauf, Einwirkzeiten und Kontraindikationen.', 'Das Video zeigt den kompletten Ablauf an einer Kundin.'] },
  { id: 4, cat: 'Behandlungen', title: 'Shellac entfernen ohne Nagelschaden', minutes: 5, updated: '28.08.2026', body: ['Ablöser, Einwirkzeit und Nachpflege.'] },
  { id: 5, cat: 'Studio', title: 'Kassenabschluss', minutes: 3, updated: '15.08.2026', body: ['Ablauf am Abend.'] },
  { id: 6, cat: 'Studio', title: 'Phorest: Termine und Notizen', minutes: 7, updated: '01.09.2026', body: ['So liest du deinen Tagesplan und hinterlegst Kundennotizen.'] },
]
export const ONBOARDING = [
  { title: 'Willkommen bei der Beautylounge', minutes: 3 },
  { title: 'Unsere Studios und das Büro', minutes: 4 },
  { title: 'Hygiene-Grundlagen', minutes: 6 },
  { title: 'Phorest und TeamHub nutzen', minutes: 5 },
  { title: 'Dein erster Tag im Studio', minutes: 4 },
]

export type Event = { id: number; title: string; date: string; time: string; place: string; link?: string; seats: number; taken: number; kind: string; deadline: string; audience: string; people: string[] }
export const EVENTS: Event[] = [
  { id: 1, title: 'Schulung: Neue Gesichtsbehandlung', date: 'Mo 05.10.', time: '09:00–12:00', place: 'Studio Basel 1', seats: 8, taken: 5, kind: 'Schulung', deadline: 'Anmeldung bis 30.09.', audience: 'Skill: Gesichtsbehandlung', people: ['Alma S.', 'Gina A.', 'Alina K.', 'Nina B.', 'Lea M.'] },
  { id: 2, title: 'Respo-Runde Oktober', date: 'Mi 07.10.', time: '18:30–19:30', place: 'Online', link: 'meet.google.com/…', seats: 7, taken: 4, kind: 'Meeting', deadline: 'Anmeldung bis 06.10.', audience: 'Respos', people: ['Bea M.', 'Xenia R.', 'Kundin D.', 'Jana P.'] },
  { id: 3, title: 'Produktschulung Pflegelinie', date: 'Do 15.10.', time: '14:00–15:30', place: 'Studio Reinach', seats: 10, taken: 3, kind: 'Schulung', deadline: 'Anmeldung bis 12.10.', audience: 'Alle Studios', people: ['Xenia R.', 'Mila F.', 'Kundin E.'] },
  { id: 4, title: 'Teamabend', date: 'Fr 20.11.', time: 'ab 19:00', place: 'Basel', seats: 60, taken: 21, kind: 'Team', deadline: 'Anmeldung bis 06.11.', audience: 'Alle', people: [] },
]

export type Mail = { id: number; from: string; subject: string; body: string; time: string; unread: boolean }
export const INBOX: Mail[] = [
  { id: 1, from: 'Renée Meier', subject: 'Dienstplan Oktober', body: 'Hallo zusammen, der Dienstplan für Oktober steht in Timebutler. Bitte bis Montag prüfen und Wünsche melden.', time: '09:14', unread: true },
  { id: 2, from: 'Berufsschule Basel', subject: 'Prüfungstermine Frühling', body: 'Die Termine für die Zwischenprüfungen sind online.', time: 'Gestern', unread: true },
  { id: 3, from: 'Cora Keller', subject: 'Lohnabrechnung September', body: 'Die Abrechnungen sind verschickt.', time: 'Mi', unread: false },
]

export type Ticket = { id: number; kind: 'Meldung' | 'Idee'; title: string; branch: string; status: 'Neu' | 'Zugewiesen' | 'In Arbeit' | 'Erledigt'; who: string; when: string; assignee?: string; photo?: boolean; viaAI?: boolean }
export const TICKETS: Ticket[] = [
  { id: 1, kind: 'Meldung', title: 'Warmwasser in Kabine 2 fällt aus', branch: 'Reinach', status: 'Zugewiesen', who: 'Xenia R.', when: 'Heute, 08:40', assignee: 'Facility', photo: true },
  { id: 2, kind: 'Idee', title: 'Pflegetipp nach der Behandlung per SMS', branch: 'Basel 1', status: 'Neu', who: 'Gina A.', when: 'Gestern' },
  { id: 3, kind: 'Meldung', title: 'Wachsgerät heizt nicht richtig', branch: 'Oberwil', status: 'In Arbeit', who: 'Alina K.', when: 'Mo', assignee: 'Cora Keller', photo: true },
  { id: 4, kind: 'Idee', title: 'Wartebereich: Wasser mit Zitrone anbieten', branch: 'Riehen', status: 'Erledigt', who: 'Lea M.', when: '18.09.', assignee: 'Renée Meier' },
]
export const ASSIGNEES = ['Facility', 'Renée Meier', 'Cora Keller', 'Eva Huber', 'Dana Meier']
