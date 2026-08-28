-- Gli esiti delle buste già spogliate diventano pubblici.
--
-- Finora `lettura_proprie_buste` mostrava a ciascuno soltanto le proprie. La
-- segretezza serve però a una cosa sola: che nessuno sappia cosa stanno
-- chiedendo gli altri **mentre** la fase è aperta. A spoglio avvenuto quella
-- ragione decade, e anzi l'informazione manca dove servirebbe: chi si è preso
-- un giocatore senza passare dall'asta non si legge da nessuna parte.
--
-- Le buste in ATTESA restano riservate: sono l'offerta in busta chiusa vera e
-- propria, ed è quella che il gioco protegge.
--
-- Nota su cosa NON si sta rivelando: VINTO si deduce già dalle rose, e CONTESO
-- è già pubblico in /aste sotto "Conteso tra". L'unica novità effettiva è
-- PERSO, cioè che qualcuno aveva chiesto un giocatore e non lo ha ottenuto —
-- storia di un turno concluso.

DROP POLICY IF EXISTS "lettura_proprie_buste" ON public.buste;

CREATE POLICY "lettura_buste" ON public.buste FOR SELECT
  USING (
    -- Le proprie, in qualunque stato.
    squadra_id = public.mia_squadra_id()
    OR public.is_admin()
    -- Gli esiti di un turno già spogliato, di chiunque.
    OR esito <> 'ATTESA'
  );

NOTIFY pgrst, 'reload schema';
