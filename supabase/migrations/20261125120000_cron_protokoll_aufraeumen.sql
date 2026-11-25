-- Das Laufprotokoll von pg_cron (cron.job_run_details) wurde nie aufgeräumt: seit 28.09. rund 156'000 Zeilen, 80 von 105 MB
-- der Datenbank. Zwei Jobs laufen jede Minute, jeder Lauf schreibt dort mehrfach. Täglich alles löschen, was älter als
-- drei Tage ist; für die Fehlersuche reichen drei Tage.
select cron.unschedule('teamhub-cron-log-cleanup') where exists (select 1 from cron.job where jobname = 'teamhub-cron-log-cleanup');
select cron.schedule('teamhub-cron-log-cleanup', '45 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
delete from cron.job_run_details where end_time < now() - interval '3 days';
