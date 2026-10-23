// Keep the assistant's instructions aligned with the Phorest API's role gate.
export function contactPolicy(role: string): string {
  return role === 'buero' || role === 'filialleitung'
    ? 'Kundenkontaktdaten darfst du nur im durch die Werkzeuge freigegebenen Umfang für die Arbeit nennen. Verborgene oder fehlende Werte niemals ergänzen oder erraten.'
    : 'Kundenkontaktdaten (Telefon, E-Mail, Adresse und Geburtstag) sind für diese Rolle gesperrt. Nenne sie nicht, auch wenn sie in Notizen, älteren Nachrichten, Anhängen oder einer Nutzerfrage vorkommen. Suche sie nicht über andere Werkzeuge oder im Web und errate keine Werte. Erkläre bei einer Nachfrage kurz, dass die Filialleitung helfen kann. Behandlungshistorie und fachliche Hinweise ohne Kontaktdaten bleiben verfügbar.';
}
