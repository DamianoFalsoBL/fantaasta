-- Tetto automatico nelle aste live.
--
-- Chi rilancia deve stare incollato allo schermo: ogni offerta avversaria va
-- ribattuta a mano entro la scadenza del timer. Il tetto permette di dichiarare
-- una volta sola fino a quanto si è disposti a spingersi, e lasciare che sia il
-- server a rispondere.
--
-- L'esecuzione è **immediata e lato server**, dentro la stessa transazione del
-- rilancio avversario. L'alternativa con un ritardo di cinque secondi contato
-- dal browser di chi ha impostato il tetto smetterebbe di proteggere appena la
-- scheda si chiude o il telefono si blocca, cioè esattamente nelle situazioni
-- per cui la funzione esiste.

CREATE TABLE IF NOT EXISTS public.massimi_asta (
    asta_id    UUID NOT NULL REFERENCES public.aste(id)    ON DELETE CASCADE,
    squadra_id UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    importo    INTEGER NOT NULL CHECK (importo > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (asta_id, squadra_id)
);

COMMENT ON TABLE public.massimi_asta IS
  'Tetto massimo dichiarato da una squadra su un''asta. Segreto: leggibile solo dal proprietario.';

-- `created_at` non è decorativo: è il criterio di spareggio fra due tetti
-- identici. Senza, l'esito dipenderebbe dall'ordine di restituzione delle righe.
COMMENT ON COLUMN public.massimi_asta.created_at IS
  'Spareggio fra tetti di pari importo: vince il più vecchio.';

ALTER TABLE public.massimi_asta ENABLE ROW LEVEL SECURITY;

-- Nessuna deroga per l'admin, a differenza della policy su `buste`: in questa
-- lega l'admin è anche un manager in gara, e conoscere i tetti altrui sarebbe
-- un vantaggio decisivo. Nessuna policy di scrittura: si passa dalle RPC.
DROP POLICY IF EXISTS "lettura_solo_propri_massimi" ON public.massimi_asta;
CREATE POLICY "lettura_solo_propri_massimi" ON public.massimi_asta FOR SELECT
USING (squadra_id IN (SELECT squadra_id FROM public.profili WHERE id = auth.uid()));

-- Volutamente fuori da supabase_realtime: nessuno deve ricevere notifiche su
-- righe che non può leggere.


-- -----------------------------------------------------------------------------
-- Il motore.
--
-- NON è un ciclo di rilanci da un credito alla volta: due tetti che si
-- rincorrono produrrebbero decine di offerte, altrettanti messaggi realtime a
-- quindici client e altrettanti azzeramenti del timer. Si calcola direttamente
-- il punto di equilibrio, come fa eBay, e si scrive una sola offerta.
-- -----------------------------------------------------------------------------
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

    SELECT COALESCE(rilancio_minimo, 1), COALESCE(durata_timer, 60)
    INTO v_rilancio, v_durata
    FROM public.regole_lega LIMIT 1;
    v_rilancio := COALESCE(v_rilancio, 1);
    v_durata   := COALESCE(v_durata, 60);

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

    -- Il tetto non basta a migliorare la situazione: nessuno rilancia contro
    -- sé stesso e nessuno pareggia un'offerta già sul tavolo.
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


-- -----------------------------------------------------------------------------
-- Dichiarare un tetto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.imposta_massimo_asta(
    p_asta_id UUID,
    p_importo INTEGER,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_asta RECORD;
    v_massimo INTEGER;
BEGIN
    v_squadra_id := public.mia_squadra_id();

    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può impostare un massimo in delega.';
        END IF;
        v_squadra_id := p_squadra_delega;
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    IF p_importo IS NULL OR p_importo <= 0 THEN
        RAISE EXCEPTION 'Il massimo deve essere un importo positivo.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;

    -- Guardia più larga di quella delle offerte, che pretendono 'IN_CORSO':
    -- su un'asta prenotata il tetto si può già dichiarare, e scatterà quando
    -- l'admin avvia il timer. È il momento naturale per farlo e allontanarsi.
    IF v_asta.stato NOT IN ('CHIAMATA', 'IN_CORSO') THEN
        RAISE EXCEPTION 'L''asta non è più attiva.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'Rosa già completa: questa squadra non può aggiudicarsi altri giocatori.';
    END IF;

    IF public.ruolo_pieno(v_squadra_id, v_asta.giocatore_id) THEN
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri.';
    END IF;

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
    END IF;

    IF v_asta.abbandoni ? v_squadra_id::text THEN
        RAISE EXCEPTION 'Hai abbandonato questa asta, non puoi impostare un massimo.';
    END IF;

    IF p_importo < v_asta.base_asta THEN
        RAISE EXCEPTION 'Il massimo deve essere almeno pari alla base d''asta (%).', v_asta.base_asta;
    END IF;

    IF v_asta.squadra_in_testa IS NOT NULL
       AND v_asta.squadra_in_testa <> v_squadra_id
       AND p_importo <= v_asta.prezzo_corrente THEN
        RAISE EXCEPTION 'Il massimo deve superare il prezzo corrente (%).', v_asta.prezzo_corrente;
    END IF;

    v_massimo := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo THEN
        RAISE EXCEPTION 'Massimo (%) superiore a quanto questa squadra può offrire (%).',
            p_importo, v_massimo;
    END IF;

    INSERT INTO public.massimi_asta (asta_id, squadra_id, importo)
    VALUES (p_asta_id, v_squadra_id, p_importo)
    ON CONFLICT (asta_id, squadra_id) DO UPDATE
    SET importo = EXCLUDED.importo, created_at = now();

    -- Ad asta prenotata si registra soltanto: risolvere adesso farebbe salire
    -- il prezzo prima ancora che l'asta cominci, togliendo a chi ha chiamato il
    -- diritto di partire dalla base.
    IF v_asta.stato = 'IN_CORSO' THEN
        PERFORM public.risolvi_massimi(p_asta_id);
    END IF;

    RETURN json_build_object('success', true, 'massimo', p_importo);
END;
$$;


CREATE OR REPLACE FUNCTION public.rimuovi_massimo_asta(
    p_asta_id UUID,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
BEGIN
    v_squadra_id := public.mia_squadra_id();

    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può rimuovere un massimo in delega.';
        END IF;
        v_squadra_id := p_squadra_delega;
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    -- Non ritira l'offerta già piazzata: quella resta valida.
    DELETE FROM public.massimi_asta
    WHERE asta_id = p_asta_id AND squadra_id = v_squadra_id;

    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.risolvi_massimi(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.imposta_massimo_asta(UUID, INTEGER, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rimuovi_massimo_asta(UUID, UUID)            TO authenticated;


-- -----------------------------------------------------------------------------
-- Offerta manuale: è l'innesco principale.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.piazza_offerta_asta(
    p_asta_id UUID,
    p_importo INTEGER,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_asta RECORD;
    v_massimo_offribile INTEGER;
    v_durata INTEGER;
    v_origine public.origine_offerta := 'MANAGER';
BEGIN
    v_squadra_id := public.mia_squadra_id();

    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può fare offerte in delega.';
        END IF;
        v_squadra_id := p_squadra_delega;
        v_origine := 'ADMIN_PER_CONTO';
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'Rosa già completa: questa squadra non può aggiudicarsi altri giocatori.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato != 'IN_CORSO' THEN RAISE EXCEPTION 'L''asta non è in corso.'; END IF;
    IF v_asta.scadenza_corrente < now() THEN RAISE EXCEPTION 'L''asta è scaduta!'; END IF;

    IF public.ruolo_pieno(v_squadra_id, v_asta.giocatore_id) THEN
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri.';
    END IF;

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
    END IF;

    IF v_asta.abbandoni ? v_squadra_id::text THEN
        RAISE EXCEPTION 'Hai abbandonato questa asta, non puoi più rilanciare.';
    END IF;

    IF v_asta.squadra_in_testa IS NULL THEN
        IF p_importo < v_asta.base_asta THEN
            RAISE EXCEPTION 'L''importo deve essere almeno pari alla base d''asta (%).', v_asta.base_asta;
        END IF;
    ELSE
        IF p_importo <= v_asta.prezzo_corrente THEN
            RAISE EXCEPTION 'L''importo deve essere superiore al prezzo corrente (%).', v_asta.prezzo_corrente;
        END IF;
    END IF;

    v_massimo_offribile := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo_offribile THEN
        RAISE EXCEPTION 'Offerta (%) superiore al massimo offribile (%).', p_importo, v_massimo_offribile;
    END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_squadra_id, p_importo, v_origine);

    UPDATE public.aste
    SET prezzo_corrente = p_importo,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = now() + (v_durata || ' seconds')::interval,
        rilanci = rilanci || jsonb_build_object(
            'squadra_id', v_squadra_id,
            'importo', p_importo,
            'origine', v_origine,
            'ts', now()
        )
    WHERE id = p_asta_id;

    -- Chi ha un tetto risponde qui, nella stessa transazione.
    PERFORM public.risolvi_massimi(p_asta_id);

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$;


-- -----------------------------------------------------------------------------
-- Avvio del timer: fa scattare i tetti dichiarati mentre l'asta era prenotata.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avvia_timer_chiamata(p_asta_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_durata INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo un admin può avviare il timer.';
    END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    UPDATE public.aste
    SET stato = 'IN_CORSO',
        scadenza_corrente = now() + (v_durata || ' seconds')::interval
    WHERE id = p_asta_id AND stato = 'CHIAMATA';

    PERFORM public.risolvi_massimi(p_asta_id);

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- Ritiro: chi si ritira non deve continuare a essere rilanciato dal proprio
-- tetto. La risoluzione lo escluderebbe comunque, ma cancellarlo lo rende
-- visibile anche nell'interfaccia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abbandona_asta(
    p_asta_id UUID,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_asta RECORD;
BEGIN
    v_squadra_id := public.mia_squadra_id();

    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può abbandonare in delega.';
        END IF;
        v_squadra_id := p_squadra_delega;
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato NOT IN ('IN_CORSO', 'CHIAMATA') THEN
        RAISE EXCEPTION 'L''asta non è più attiva.';
    END IF;

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
    END IF;

    IF v_asta.squadra_in_testa = v_squadra_id THEN
        RAISE EXCEPTION 'Non puoi abbandonare mentre sei in testa all''asta.';
    END IF;

    DELETE FROM public.massimi_asta
    WHERE asta_id = p_asta_id AND squadra_id = v_squadra_id;

    IF NOT (v_asta.abbandoni ? v_squadra_id::text) THEN
        UPDATE public.aste
        SET abbandoni = abbandoni || to_jsonb(v_squadra_id::text)
        WHERE id = p_asta_id;
    END IF;

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- Chiusura: i tetti muoiono con l'asta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chiudi_asta(p_asta_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta RECORD;
    v_prezzo INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può chiudere un''asta.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;

    IF v_asta.stato = 'CHIUSA' THEN
        RETURN json_build_object('success', true, 'message', 'Asta già chiusa.');
    END IF;

    DELETE FROM public.massimi_asta WHERE asta_id = p_asta_id;

    IF v_asta.squadra_in_testa IS NOT NULL AND public.rosa_completa(v_asta.squadra_in_testa) THEN
        UPDATE public.aste SET stato = 'CHIUSA', squadra_in_testa = NULL WHERE id = p_asta_id;
        IF v_asta.consuma_turno THEN PERFORM public.avanza_turno_chiamata(); END IF;
        RETURN json_build_object(
            'success', true,
            'message', 'Rosa del vincitore già completa: giocatore NON assegnato, resta libero.'
        );
    END IF;

    IF v_asta.squadra_in_testa IS NOT NULL
       AND public.ruolo_pieno(v_asta.squadra_in_testa, v_asta.giocatore_id) THEN
        UPDATE public.aste SET stato = 'CHIUSA', squadra_in_testa = NULL WHERE id = p_asta_id;
        IF v_asta.consuma_turno THEN PERFORM public.avanza_turno_chiamata(); END IF;
        RETURN json_build_object(
            'success', true,
            'message', 'Il vincitore ha già il numero massimo di portieri: giocatore NON assegnato, resta libero.'
        );
    END IF;

    IF v_asta.squadra_in_testa IS NOT NULL THEN
        v_prezzo := COALESCE(NULLIF(v_asta.prezzo_corrente, 0), v_asta.base_asta);

        INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
        VALUES (v_asta.squadra_in_testa, v_asta.giocatore_id, v_prezzo)
        ON CONFLICT (giocatore_id) DO UPDATE
        SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

        UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = v_asta.giocatore_id;

        UPDATE public.squadre
        SET crediti_residui = crediti_residui - v_prezzo,
            slot_occupati = slot_occupati + 1
        WHERE id = v_asta.squadra_in_testa;

        UPDATE public.buste
        SET esito = CASE WHEN squadra_id = v_asta.squadra_in_testa THEN 'VINTO'::public.esito_busta
                         ELSE 'PERSO'::public.esito_busta END
        WHERE giocatore_id = v_asta.giocatore_id AND esito = 'CONTESO';
    END IF;

    UPDATE public.aste SET stato = 'CHIUSA' WHERE id = p_asta_id;

    IF v_asta.consuma_turno THEN PERFORM public.avanza_turno_chiamata(); END IF;

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- Chiamata e avvio d'ufficio: azzerano i tetti dell'asta.
--
-- `aste` ha un vincolo di unicità su `giocatore_id` e questi due punti fanno
-- `ON CONFLICT (giocatore_id) DO UPDATE`: rimettendo all'asta un giocatore si
-- RIUSA la stessa riga, con lo stesso id. Senza pulizia esplicita, un tetto
-- della tornata precedente resterebbe attivo e piazzerebbe offerte a nome di
-- qualcuno che non ha chiesto niente. Il CASCADE non basta: copre solo
-- l'annullamento, che la riga la cancella davvero.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prenota_chiamata(p_giocatore_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_quotazione INTEGER;
    v_count INTEGER;
    v_ordine UUID[];
    v_indice INTEGER;
    v_asta_id UUID;
BEGIN
    v_squadra_id := public.mia_squadra_id();
    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'La tua rosa è già completa: non puoi chiamare altri giocatori.';
    END IF;

    IF public.ruolo_pieno(v_squadra_id, p_giocatore_id) THEN
        RAISE EXCEPTION 'Hai già il numero massimo di portieri (%).',
            COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3);
    END IF;

    SELECT ordine_chiamata, indice_chiamata INTO v_ordine, v_indice
    FROM public.regole_lega LIMIT 1;

    IF v_ordine IS NOT NULL AND array_length(v_ordine, 1) > 0 THEN
        IF v_ordine[v_indice] IS DISTINCT FROM v_squadra_id THEN
            RAISE EXCEPTION 'Non è il tuo turno di chiamata!';
        END IF;
    END IF;

    SELECT count(*) INTO v_count FROM public.aste WHERE stato IN ('IN_CORSO', 'CHIAMATA');
    IF v_count > 0 THEN
        RAISE EXCEPTION 'C''è già un''asta in corso o in attesa di avvio.';
    END IF;

    SELECT quotazione INTO v_quotazione FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        squadra_in_testa, rilanci, abbandoni, consuma_turno
    ) VALUES (
        p_giocatore_id, 'CHIAMATA', v_quotazione, v_quotazione,
        v_squadra_id, '[]'::jsonb, '[]'::jsonb, TRUE
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'CHIAMATA',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = v_squadra_id,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb,
        scadenza_corrente = NULL,
        consuma_turno = TRUE
    RETURNING id INTO v_asta_id;

    DELETE FROM public.massimi_asta WHERE asta_id = v_asta_id;

    RETURN json_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.avvia_asta_admin(p_giocatore_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quotazione INTEGER;
    v_durata INTEGER;
    v_ordine UUID[];
    v_indice INTEGER;
    v_len INTEGER;
    v_i INTEGER;
    v_pos INTEGER;
    v_cand UUID;
    v_testa UUID := NULL;
    v_consuma BOOLEAN := FALSE;
    v_asta_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può avviare un''asta.';
    END IF;

    SELECT quotazione INTO v_quotazione FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    SELECT ordine_chiamata, COALESCE(indice_chiamata, 1)
    INTO v_ordine, v_indice
    FROM public.regole_lega LIMIT 1;

    v_len := COALESCE(array_length(v_ordine, 1), 0);

    IF v_len > 0 THEN
        FOR v_i IN 0 .. v_len - 1 LOOP
            v_pos := ((v_indice - 1 + v_i) % v_len) + 1;
            v_cand := v_ordine[v_pos];

            IF v_cand IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM public.liste_aste
                   WHERE giocatore_id = p_giocatore_id AND squadra_id = v_cand
               )
               AND NOT public.rosa_completa(v_cand)
               AND NOT public.ruolo_pieno(v_cand, p_giocatore_id)
               AND public.calcola_massimo_offribile(v_cand, p_giocatore_id) >= v_quotazione
            THEN
                v_testa := v_cand;
                v_consuma := (v_i = 0);
                EXIT;
            END IF;
        END LOOP;
    END IF;

    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        scadenza_corrente, squadra_in_testa, rilanci, abbandoni, consuma_turno
    ) VALUES (
        p_giocatore_id, 'IN_CORSO', v_quotazione, v_quotazione,
        now() + (v_durata || ' seconds')::interval, v_testa, '[]'::jsonb, '[]'::jsonb, v_consuma
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'IN_CORSO',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = v_testa,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb,
        scadenza_corrente = now() + (v_durata || ' seconds')::interval,
        consuma_turno = v_consuma
    RETURNING id INTO v_asta_id;

    DELETE FROM public.massimi_asta WHERE asta_id = v_asta_id;

    RETURN json_build_object(
        'success', true,
        'squadra_in_testa', v_testa,
        'prezzo', v_quotazione,
        'consuma_turno', v_consuma
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
