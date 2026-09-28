-- Beispielinhalte aus dem Prototyp (Layout-Abstimmung 25.09.). Alle mit is_sample = true;
-- sobald Renées echte Inhalte (BLTH-10) da sind: delete from ... where is_sample.

insert into public.skills (name, sort, is_sample) values ('Gesichtsbehandlung',0,true), ('Lashlifting',1,true), ('Brow-Styling',2,true), ('Waxing',3,true), ('Intimwaxing',4,true), ('Maniküre',5,true), ('Shellac',6,true), ('Pediküre',7,true), ('Massage',8,true), ('Microneedling',9,true), ('Studioleitung',10,true), ('Berufsbildung',11,true) on conflict do nothing;
insert into public.news (title,teaser,body,tag,must_read,author_name,publish_at,wiki_category,is_sample) values ('Neue Hygienerichtlinie ab 1. Oktober','Liegen werden jetzt nach jeder Behandlung desinfiziert, nicht mehr stündlich.','Ab dem 1. Oktober gilt in allen Studios die überarbeitete Hygienerichtlinie. Die wichtigste Änderung: Liegen und Kopfstützen werden nach jeder Behandlung desinfiziert. Die Checkliste in euren Tagesaufgaben ist bereits angepasst.

Die komplette Richtlinie steht im Wissen unter „Hygiene“. Bitte lest sie und bestätigt hier.','Pflicht',true,'Büro',now() - interval '1 days','Hygiene',true);
insert into public.news (title,teaser,body,tag,must_read,author_name,publish_at,wiki_category,is_sample) values ('Trainee-Behandlungen wieder buchbar','Die Sonderangebote für Trainee-Behandlungen sind reaktiviert.','Die Trainee-Angebote sind in Phorest wieder aktiv und online buchbar. Bitte prüft bei euren Trainees, dass die Zuteilung stimmt.','Studio',false,'Büro',now() - interval '2 days',null,true);
insert into public.news (title,teaser,body,tag,must_read,author_name,publish_at,wiki_category,is_sample) values ('Herbstaktion Lashlifting','Vom 5. bis 31. Oktober 15 % auf Lashlifting mit Färben.','Unsere Herbstaktion startet am 5. Oktober. Die Aufsteller kommen nächste Woche in die Studios. Fragen gerne an Eva.','Marketing',false,'Büro',now() - interval '3 days',null,true);
insert into public.news (title,teaser,body,tag,must_read,author_name,publish_at,wiki_category,is_sample) values ('Teamabend im November','Save the Date: Freitag, 20. November. Anmeldung im Kalender.','Wir feiern gemeinsam das Jahr. Details und Anmeldung findet ihr im Kalender.','Team',false,'Büro',now() - interval '4 days',null,true);
with t as (insert into public.task_templates (name,repeat,sort,is_sample) values ('Öffnung','daily',0,true) returning id) insert into public.task_items (template_id,title,due_time,prio,proof_photo,sort) select t.id, x.title, x.due::time, x.prio, x.proof, x.sort from t, (values ('Studio aufschliessen, Licht und Musik an','07:45',false,false,0), ('Kabinen 1–3 desinfizieren','07:50',true,true,1), ('Wachs erwärmen, Temperatur prüfen','07:55',false,false,2)) as x(title,due,prio,proof,sort);
with t as (insert into public.task_templates (name,repeat,sort,is_sample) values ('Mittag','daily',1,true) returning id) insert into public.task_items (template_id,title,due_time,prio,proof_photo,sort) select t.id, x.title, x.due::time, x.prio, x.proof, x.sort from t, (values ('Handtücher auffüllen','12:00',false,false,0), ('Kühlschrank-Temperatur eintragen','12:00',true,false,1)) as x(title,due,prio,proof,sort);
with t as (insert into public.task_templates (name,repeat,sort,is_sample) values ('Schliessung','daily',2,true) returning id) insert into public.task_items (template_id,title,due_time,prio,proof_photo,sort) select t.id, x.title, x.due::time, x.prio, x.proof, x.sort from t, (values ('Wäsche in die Maschine','17:30',false,false,0), ('Kasse abschliessen','18:00',true,false,1), ('Liegen und Böden reinigen','18:05',false,true,2)) as x(title,due,prio,proof,sort);
with t as (insert into public.task_templates (name,repeat,weekday,sort,is_sample) values ('Wochenputz','weekly',1,10,true) returning id) insert into public.task_items (template_id,title,prio,proof_photo,sort) select t.id, x.title, false, x.proof, x.sort from t, (values ('Kühlschrank auswaschen',false,0),('Fenster und Spiegel putzen',false,1),('Vorrat Einwegmaterial prüfen',false,2)) as x(title,proof,sort);
with t as (insert into public.task_templates (name,repeat,monthday,sort,is_sample) values ('Inventur Produkte','monthly',1,11,true) returning id) insert into public.task_items (template_id,title,prio,proof_photo,sort) select t.id, 'Produktbestand zählen und melden', true, false, 0 from t;
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Hygiene','Desinfektion nach jeder Behandlung','Nach jeder Behandlung werden Liege, Kopfstütze, Arbeitsfläche und Instrumente gereinigt.

1. Einwegauflage entfernen und entsorgen.

2. Flächen mit Desinfektionsmittel einsprühen, 60 Sekunden einwirken lassen.

3. Mit frischem Tuch nachwischen, neue Auflage auflegen.

Instrumente kommen ins Ultraschallbad und anschliessend in den Sterilisator.',4,'video',0,true);
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Hygiene','Umgang mit Wachs und Spateln','Spatel nie zweimal ins Wachs tauchen.

Wachstemperatur vor jeder Kundin am Handgelenk prüfen.',3,'none',1,true);
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Behandlungen','Lashlifting Schritt für Schritt','Ablauf, Einwirkzeiten und Kontraindikationen.

Das Video zeigt den kompletten Ablauf an einer Kundin.',8,'video',2,true);
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Behandlungen','Shellac entfernen ohne Nagelschaden','Ablöser, Einwirkzeit und Nachpflege.',5,'none',3,true);
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Studio','Kassenabschluss','Ablauf am Abend.',3,'none',4,true);
insert into public.wiki_articles (category,title,body,minutes,media_kind,sort,is_sample) values ('Studio','Phorest: Termine und Notizen','So liest du deinen Tagesplan und hinterlegst Kundennotizen.',7,'none',5,true);
insert into public.onboarding_steps (title,minutes,sort,is_sample) values ('Willkommen bei der Beautylounge',3,0,true);
insert into public.onboarding_steps (title,minutes,sort,is_sample) values ('Unsere Studios und das Büro',4,1,true);
insert into public.onboarding_steps (title,minutes,sort,is_sample) values ('Hygiene-Grundlagen',6,2,true);
insert into public.onboarding_steps (title,minutes,sort,is_sample) values ('Phorest und TeamHub nutzen',5,3,true);
insert into public.onboarding_steps (title,minutes,sort,is_sample) values ('Dein erster Tag im Studio',4,4,true);
insert into public.events (title,kind,starts_at,ends_at,place,link,capacity,register_until,audience_branches,audience_skills,is_sample) values ('Schulung: Neue Gesichtsbehandlung','Schulung','2026-10-05 09:00'::timestamp at time zone 'Europe/Zurich','2026-10-05 12:00'::timestamp at time zone 'Europe/Zurich','Studio Basel 1',null,8,'2026-09-30 23:59'::timestamp at time zone 'Europe/Zurich','{}','{Gesichtsbehandlung}',true);
insert into public.events (title,kind,starts_at,ends_at,place,link,capacity,register_until,audience_branches,audience_skills,is_sample) values ('Respo-Runde Oktober','Meeting','2026-10-07 18:30'::timestamp at time zone 'Europe/Zurich','2026-10-07 19:30'::timestamp at time zone 'Europe/Zurich','Online','https://meet.google.com/',null,'2026-10-06 23:59'::timestamp at time zone 'Europe/Zurich','{}','{}',true);
insert into public.events (title,kind,starts_at,ends_at,place,link,capacity,register_until,audience_branches,audience_skills,is_sample) values ('Produktschulung Pflegelinie','Schulung','2026-10-15 14:00'::timestamp at time zone 'Europe/Zurich','2026-10-15 15:30'::timestamp at time zone 'Europe/Zurich','Studio Reinach',null,10,'2026-10-12 23:59'::timestamp at time zone 'Europe/Zurich','{}','{}',true);
insert into public.events (title,kind,starts_at,ends_at,place,link,capacity,register_until,audience_branches,audience_skills,is_sample) values ('Teamabend','Team','2026-11-20 19:00'::timestamp at time zone 'Europe/Zurich',null,'Basel',null,60,'2026-11-06 23:59'::timestamp at time zone 'Europe/Zurich','{}','{}',true);
