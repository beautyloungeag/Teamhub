// Startadresse beim Laden, bevor die App sie aufräumt: Direktlinks aus Mitteilungen und Unterlagen.
//   ?open=<ziel>  öffnet die Mitarbeiterin-App an einer Stelle (auch für Leitung und Büro am Desktop)
//   ?bo=<seite>   öffnet das Backoffice auf einer Seite (overview, book, news, tasks, tickets, events, standby, learn, team, performance, wiki, settings, benni, me)
export const startParams = new URLSearchParams(location.search)
