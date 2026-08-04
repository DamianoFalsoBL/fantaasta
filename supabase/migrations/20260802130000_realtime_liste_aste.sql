-- Aggiunge liste_aste e tesseramenti alla publication realtime.
--
-- TabelloneAsta si sottoscrive a `liste_aste` per aggiornare la lista chiamate
-- e i contendenti. La tabella però non era nella publication, e un binding su
-- una tabella non pubblicata **azzera la consegna dell'intero canale**: lo
-- stato riportato resta `SUBSCRIBED`, ma non arriva più alcun evento, nemmeno
-- quelli di `aste`. Da qui il tabellone fermo su "Nessuna asta in corso"
-- mentre a database l'asta era in corso.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['liste_aste', 'tesseramenti']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
