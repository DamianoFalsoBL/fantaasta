-- Il massimo automatico non rilancia più contro chi è già in testa.
--
-- Segnalato dal campo: un manager chiama un giocatore a 6, resta in testa alla
-- base, e prima dell'avvio dichiara un massimo di 15. All'avvio del timer il
-- sistema piazza un'offerta AUTOMATICO da 7 a nome suo. Verificato sui dati
-- dell'asta di Busio: 7 AUTOMATICO (Campioni du Quore), 8 ADMIN_PER_CONTO
-- (St Mirren), 9 AUTOMATICO (Campioni du Quore). La prima non doveva esistere;
-- la terza è corretta, perché risponde a un avversario.
--
-- Il commento nel corpo diceva già «nessuno rilancia contro sé stesso», ma il
-- controllo non c'era: si verificava solo che il prezzo salisse
-- (`v_nuovo <= prezzo_corrente`), mai CHI fosse in testa. Con il proprietario
-- del tetto già primo, `v_nuovo` vale `prezzo_corrente + rilancio_minimo`,
-- quindi la condizione passava sempre.
--
-- Da notare: `imposta_massimo_asta` aveva già la guardia giusta — dichiara il
-- tetto senza risolverlo se l'asta è solo prenotata, «togliendo a chi ha
-- chiamato il diritto di partire dalla base» — ma quella guardia rimandava il
-- problema all'avvio del timer invece di toglierlo. La correzione va qui
-- dentro, dove vale per tutti e tre i punti che invocano la funzione:
-- avvia_timer_chiamata, piazza_offerta_asta e imposta_massimo_asta.
--
-- Non era un caso di apertura soltanto: chi detiene il tetto più alto e piazza
-- un rilancio a mano si ritrovava a farsi rilanciare di un credito da sé
-- stesso, e a ogni successiva risoluzione il prezzo saliva ancora, fino al
-- proprio tetto, senza che nessun avversario avesse offerto nulla.
--
-- Corpo copiato alla lettera da 20260808100000_timer_configurabile.sql: cambia
-- solo il blocco marcato più sotto.

CREATE OR REPLACE FUNCTION public.risolvi_massimi(p_asta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta       RECORD;
    v_rilancio   INTEGER;
    v_durata     INTEGER;
    v_vincitore  UUID;
    v_primo      INTEGER;
    v_secondo    INTEGER;
    v_base       INTEGER;
    v_nuovo      INTEGER;
BEGIN
    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND OR v_asta.stato <> 'IN_CORSO' THEN RETURN; END IF;
    IF v_asta.scadenza_corrente IS NOT NULL AND v_asta.scadenza_corrente < now() THEN RETURN; END IF;

    SELECT COALESCE(rilancio_minimo, 1), COALESCE(durata_timer_rilancio, 10)
    INTO v_rilancio, v_durata
    FROM public.regole_lega LIMIT 1;
    v_rilancio := COALESCE(v_rilancio, 1);
    v_durata   := COALESCE(v_durata, 10);

    -- Un tetto vale solo se la squadra può davvero onorarlo adesso: la capienza
    -- di spesa cambia man mano che si chiudono altre aste, e le guardie di
    -- dominio (ritiro, rosa piena, portieri, partecipazione) vanno rivalutate a
    -- ogni risoluzione, non solo quando il tetto viene dichiarato.
    SELECT
        (array_agg(squadra_id ORDER BY eff DESC, created_at ASC))[1],
        (array_agg(eff        ORDER BY eff DESC, created_at ASC))[1],
        COALESCE((array_agg(eff ORDER BY eff DESC, created_at ASC))[2], 0)
    INTO v_vincitore, v_primo, v_secondo
    FROM (
        SELECT m.squadra_id,
               m.created_at,
               LEAST(m.importo,
                     public.calcola_massimo_offribile(m.squadra_id, v_asta.giocatore_id)) AS eff
        FROM public.massimi_asta m
        WHERE m.asta_id = p_asta_id
          AND NOT (v_asta.abbandoni ? m.squadra_id::text)
          AND public.squadra_in_gara(v_asta.giocatore_id, m.squadra_id)
          AND NOT public.rosa_completa(m.squadra_id)
          AND NOT public.ruolo_pieno(m.squadra_id, v_asta.giocatore_id)
    ) v
    WHERE v.eff > 0;

    IF v_vincitore IS NULL THEN RETURN; END IF;

    -- ---- L'UNICA AGGIUNTA RISPETTO ALLA VERSIONE PRECEDENTE ----
    --
    -- Chi è già in testa non ha nulla da battere: il suo tetto serve a
    -- rispondere agli avversari, non ad alzare la propria stessa offerta. Il
    -- rilancio automatico riparte quando qualcun altro passa davanti.
    --
    -- `IS NOT NULL` esplicito e non solo il confronto: con `squadra_in_testa`
    -- NULL — asta avviata d'ufficio dall'admin, senza nessuno in testa — il
    -- confronto varrebbe NULL, l'IF non scatterebbe e il comportamento sarebbe
    -- comunque quello giusto, ma per un motivo che nessuno ricorderebbe fra sei
    -- mesi. Scritto così si legge l'intenzione: lì il tetto DEVE poter
    -- prendere il giocatore alla base.
    IF v_asta.squadra_in_testa IS NOT NULL
       AND v_vincitore = v_asta.squadra_in_testa THEN
        RETURN;
    END IF;
    -- ---- fine dell'aggiunta ----

    -- Cifra da battere. Senza nessuno in testa si parte dalla base d'asta:
    -- `avvia_asta_admin` lascia `prezzo_corrente` già pari alla base, quindi
    -- non la si può usare come soglia o il primo tetto non scatterebbe mai.
    IF v_asta.squadra_in_testa IS NULL THEN
        v_base := v_asta.base_asta - v_rilancio;
    ELSE
        v_base := v_asta.prezzo_corrente;
    END IF;

    v_base  := GREATEST(v_base, v_secondo);
    v_nuovo := LEAST(v_primo, v_base + v_rilancio);

    -- Il tetto non basta a migliorare la situazione: nessuno pareggia
    -- un'offerta già sul tavolo. Il caso «rilancio su me stesso» è escluso
    -- sopra: questo controllo guarda solo la cifra, non chi la fa, ed è
    -- proprio per questo che da solo non bastava.
    IF v_asta.squadra_in_testa IS NULL THEN
        IF v_nuovo < v_asta.base_asta THEN RETURN; END IF;
    ELSE
        IF v_nuovo <= v_asta.prezzo_corrente THEN RETURN; END IF;
    END IF;

    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_vincitore, v_nuovo, 'AUTOMATICO');

    UPDATE public.aste
    SET prezzo_corrente    = v_nuovo,
        squadra_in_testa   = v_vincitore,
        scadenza_corrente  = now() + (v_durata || ' seconds')::interval,
        rilanci = rilanci || jsonb_build_object(
            'squadra_id', v_vincitore,
            'importo', v_nuovo,
            'origine', 'AUTOMATICO',
            'ts', now()
        )
    WHERE id = p_asta_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
