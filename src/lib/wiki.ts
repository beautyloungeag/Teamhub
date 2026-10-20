// Wissen: Emoji je Thema. Standard steht hier, das Büro kann es je Thema ändern (Tabelle wiki_categories).
export const CAT_EMOJI: Record<string, string> = {
  ablauf: '📋', allgemein: '📌', 'how-to': '💡', behandlung: '💆‍♀️', filialen: '📍', füsse: '🦶', arbeitsplatz: '🪑', gerät: '🔌',
  mitarbeiter: '👥', gutschein: '🎁', ausbildung: '🎓', arbeitszeit: '⏰', lehre: '📚', frei: '🌴', face: '✨', marketing: '📣',
  reglement: '📜', kunden: '🤝', büro: '🗂️', hr: '🪪', kasse: '💳', bestellung: '📦', lohn: '💰', verkauf: '🛍️', nägel: '💅',
  wichtig: '⭐', praktikum: '🧑‍🎓', massage: '🤲', body: '🧴', leitfaden: '🧭', versicherung: '🛡️', hygiene: '🧼', news: '📰',
}
export const catKey = (name: string) => name.trim().toLowerCase()
export const emojiOf = (name: string, custom: Record<string, string>) => custom[catKey(name)] ?? CAT_EMOJI[catKey(name)] ?? '📄'
// Auswahl im Backoffice: ruhige, eindeutige Zeichen für Studio-Themen
export const EMOJI_CHOICES = ['📋', '📌', '💡', '💆‍♀️', '📍', '🦶', '🪑', '🔌', '👥', '🎁', '🎓', '⏰', '📚', '🌴', '✨', '📣', '📜', '🤝', '🗂️', '🪪', '💳', '📦', '💰', '🛍️', '💅', '⭐', '🧑‍🎓', '🤲', '🧴', '🧭', '🛡️', '🧼', '📰', '💄', '🧖‍♀️', '🌿', '🧽', '🧾', '📞', '🔑', '🚪', '🧹', '🩺', '⚠️', '📅', '🏷️', '🖥️', '📷', '🎥', '❤️']
