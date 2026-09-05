-- I tetti automatici si combattono fra loro, e il pareggio non e' piu' muto.
--
-- Segnalato dal campo il 5 settembre: «se due manager mettono il rilancio
-- automatico con lo stesso importo, al secondo il sistema non lo lascia mettere
-- e non capisce perche'». Guardando il codice il difetto non era uno solo.
--
-- ## Cosa succedeva
--
-- 1. **Il pareggio veniva rifiutato**, e il messaggio non spiegava la regola.
--    In `imposta_massimo_asta` un tetto pari al prezzo corrente non passa,
--    perche' pareggiare non basta a passare in testa. Vero, ma detto come un
--    cavillo: la regola — a parita' resta in testa chi ci e' arrivato prima —
--    non era scritta da nessuna parte.
--
-- 2. **Quando invece passava, non succedeva niente.** Con il prezzo sotto il
--    tetto, il secondo massimo veniva accettato e restava inerte: chi lo aveva
--    dichiarato leggeva «attivo — rilancio da solo fino a questa cifra», una
--    promessa che il sistema non poteva mantenere.
--
-- 3. **La piu' grossa: due tetti non si combattevano mai.** Non e' un problema
--    dei soli pareggi. Con A a 50 e B a 40 e nessun rilancio a mano, il prezzo
--    restava dov'era e A si prendeva il giocatore a 11, pur essendocene uno
--    disposto a 40.
--
-- Il punto 3 nasce dalla correzione del 27 agosto
-- (`20260827100000_massimo_non_rilancia_su_se_stesso.sql`), che impediva al
-- proprio tetto di alzare la propria stessa offerta. L'intento era giusto e
-- resta valido; il taglio era troppo largo, perche' fermava il rilancio anche
-- quando a giustificarlo era il tetto di un avversario.
--
-- ## Cosa fa adesso
--
-- La regola e' quella dell'asta a proxy, la stessa di eBay: chi e' in testa
-- sale fino a quanto serve per battere il miglior tetto avversario, mai oltre
-- il proprio. Con due tetti pari il prezzo arriva al tetto e resta in testa chi
-- e' arrivato prima — cosi' il secondo lo vede subito, invece di scoprirlo a
-- fine asta.
--
-- **Conseguenza da conoscere prima di usarlo**: dal prezzo si deduce ora
-- all'incirca il tetto dell'avversario, e chi dichiara un tetto alto se lo vede
-- addebitare appena qualcun altro ne dichiara uno, non solo quando arriva un
-- rilancio a mano. E' il patto delle aste a proxy, ed e' stato scelto
-- consapevolmente il 5 settembre.
--
-- ## Il resto del lavoro sta altrove, di proposito
--
-- I punti 1 e 2 sono corretti a parte, perche' sono separabili da questo: il
-- messaggio dell'eccezione in `20260905160000_messaggio_pareggio.sql`, e
-- l'interfaccia in `src/components/TabelloneAsta.tsx` — il campo del massimo
-- aveva `min = prezzo + 1`, quindi il rifiuto che il manager vedeva non era
-- nemmeno il nostro: era il fumetto nativo del browser, nella sua lingua. E'
-- esattamente il motivo per cui «non capiva perche'».
--
-- Questa migration e' l'unica delle tre che cambia **quanto si paga**, ed e'
-- per questo che sta da sola: se un giorno la si vuole togliere, si toglie
-- questa e le spiegazioni restano.
--
-- Corpo copiato alla lettera da
-- `20260827100000_massimo_non_rilancia_su_se_stesso.sql`. Cambia solo quello
-- che e' segnato.


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

    -- ---- CHI E' GIA' IN TESTA SALE SOLO SE UN AVVERSARIO LO GIUSTIFICA ----
    --
    -- Il 27 agosto qui c'era un `RETURN` secco: chi ha il tetto piu' alto ed e'
    -- gia' in testa non rilanciava. Serviva a impedire che il proprio tetto
    -- alzasse la propria stessa offerta — «7 AUTOMATICO» a nome di chi era gia'
    -- in testa a 6 — e quel difetto resta corretto: il ramo qui sotto non fa
    -- salire nessuno se non c'e' un avversario a spingere.
    --
    -- Quel `RETURN` pero' tagliava troppo: bloccava il rilancio anche quando a
    -- giustificarlo era il tetto di **un avversario**. Conseguenza, segnalata
    -- dal campo il 5 settembre: due tetti non si combattevano mai. Con A a 50 e
    -- B a 40, senza rilanci a mano, il prezzo restava dov'era e A si prendeva
    -- il giocatore a 11 pur essendocene uno disposto a 40. Con due tetti pari
    -- il secondo non muoveva niente, e chi lo aveva dichiarato leggeva
    -- «attivo» senza poter mai andare in testa.
    --
    -- La regola giusta e' quella dell'asta a proxy: chi e' in testa sale fino a
    -- quanto serve per battere il **miglior tetto avversario**, mai oltre il
    -- proprio, e mai per superare se stesso.
    --
    -- `IS NOT NULL` esplicito e non solo il confronto: con `squadra_in_testa`
    -- NULL — asta avviata d'ufficio dall'admin, senza nessuno in testa — il
    -- confronto varrebbe NULL, l'IF non scatterebbe e il comportamento sarebbe
    -- comunque quello giusto, ma per un motivo che nessuno ricorderebbe fra sei
    -- mesi. Scritto così si legge l'intenzione: lì il tetto DEVE poter
    -- prendere il giocatore alla base.
    IF v_asta.squadra_in_testa IS NOT NULL
       AND v_vincitore = v_asta.squadra_in_testa THEN
        -- Nessun avversario arriva al prezzo attuale: non c'e' niente da
        -- battere, e salire sarebbe rilanciare contro se stessi.
        IF v_secondo < v_asta.prezzo_corrente THEN RETURN; END IF;

        v_nuovo := LEAST(v_primo, v_secondo + v_rilancio);
        IF v_nuovo <= v_asta.prezzo_corrente THEN RETURN; END IF;

        INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
        VALUES (p_asta_id, v_vincitore, v_nuovo, 'AUTOMATICO');

        UPDATE public.aste
        SET prezzo_corrente    = v_nuovo,
            -- Il capofila non cambia: sale solo la cifra. Per questo qui non
            -- si tocca `squadra_in_testa`, al contrario dell'UPDATE in fondo.
            scadenza_corrente  = now() + (v_durata || ' seconds')::interval,
            rilanci = rilanci || jsonb_build_object(
                'squadra_id', v_vincitore,
                'importo', v_nuovo,
                'origine', 'AUTOMATICO',
                'ts', now()
            )
        WHERE id = p_asta_id;
        RETURN;
    END IF;
    -- ---- fine ----

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
