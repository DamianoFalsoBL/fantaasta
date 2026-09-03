-- URGENTE: elimina la vecchia firma di `prenota_chiamata`.
--
-- `20260902140000_chiamata_per_conto.sql` ha aggiunto il parametro
-- `p_squadra_delega`. **`CREATE OR REPLACE FUNCTION` con una firma diversa non
-- sostituisce la funzione: ne crea una seconda.** Dopo quel push a database ne
-- esistevano due:
--
--   public.prenota_chiamata(p_giocatore_id integer)
--   public.prenota_chiamata(p_giocatore_id integer, p_squadra_delega uuid)
--
-- e PostgREST, ricevendo una chiamata con il solo `p_giocatore_id`, non sa
-- quale scegliere. Risponde:
--
--   «Could not choose the best candidate function between: ...»
--
-- Cioe' **nessun manager riesce piu' a chiamare un giocatore**, che e' l'azione
-- centrale dell'asta. Trovato subito dopo il push del 2 settembre provando la
-- firma vecchia; senza quella prova sarebbe uscito in faccia al primo manager
-- di turno, durante un'asta dal vivo.
--
-- La nuova firma copre gia' il caso di prima: `p_squadra_delega` ha
-- `DEFAULT NULL` e senza delega la funzione si comporta esattamente come la
-- vecchia. Basta quindi togliere quella a un parametro.
--
-- **Trappola per il futuro:** aggiungere un parametro a una funzione esistente
-- non e' mai una sostituzione. O si mantiene la stessa firma, o si fa il DROP
-- esplicito della vecchia **nella stessa migration**. Non e' bastato che il
-- corpo fosse copiato alla lettera: era la firma il problema.

DROP FUNCTION IF EXISTS public.prenota_chiamata(INTEGER);

NOTIFY pgrst, 'reload schema';
