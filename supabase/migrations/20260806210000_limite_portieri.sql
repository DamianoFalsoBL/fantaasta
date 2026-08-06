-- Tetto ai portieri per squadra.
--
-- Finora l'unico limite di rosa era `slot_totali`: 30 giocatori, ripartizione
-- per ruolo libera. Nella pratica una squadra si è ritrovata con 4 portieri, e
-- il regolamento della lega ne ammette al massimo 3.
--
-- Il controllo va messo **al momento dell'impegno**, non dopo la vittoria: a
-- busta assegnata o asta chiusa i crediti sono già spesi e lo slot occupato,
-- e l'unico rimedio sarebbe l'annullamento, cioè un intervento manuale
-- dell'admin che riscrive budget e contatori. Una regola di gioco diventerebbe
-- una procedura di pulizia.
--
-- Il limite si esprime come "non puoi aggiungerne un altro se ne hai già N":
-- chi oggi è oltre soglia non viene toccato, semplicemente non può salire.
--
-- Si riusa la colonna `slot_p`, che esiste dall'inizio, vale già 3 e non è
-- letta da nessuna funzione viva: l'unico riferimento era in una versione di
-- `calcola_massimo_offribile` poi riscritta. Cambia quindi il significato, non
-- lo schema: da informativa a vincolante.

COMMENT ON COLUMN public.regole_lega.slot_p IS
  'Numero massimo di portieri per squadra. Vincolante: applicato da chiamata, offerta, buste e spoglio.';


-- -----------------------------------------------------------------------------
-- Quanti portieri può ancora prendere una squadra.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portieri_disponibili(p_squadra_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT GREATEST(
        COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3)
        - (
            SELECT count(*)
            FROM public.tesseramenti t
            JOIN public.giocatori g ON g.id = t.giocatore_id
            WHERE t.squadra_id = p_squadra_id AND g.ruolo = 'P'
        ),
        0
    )::INTEGER;
$$;


-- -----------------------------------------------------------------------------
-- Predicato unico, sulla stessa falsariga di rosa_completa(): questa squadra
-- ha esaurito i posti per il ruolo di questo giocatore?
--
-- Oggi vale solo per i portieri. Se un domani si vorranno limitare anche gli
-- altri reparti, è qui che si aggiungono i rami, e i sette punti che lo
-- chiamano non vanno toccati.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ruolo_pieno(p_squadra_id UUID, p_giocatore_id INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ruolo public.ruolo_giocatore;
BEGIN
    SELECT ruolo INTO v_ruolo FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_ruolo IS DISTINCT FROM 'P' THEN RETURN FALSE; END IF;
    RETURN public.portieri_disponibili(p_squadra_id) <= 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portieri_disponibili(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ruolo_pieno(UUID, INTEGER) TO authenticated;


-- -----------------------------------------------------------------------------
-- Chiamata: non si può chiamare un portiere se il reparto è pieno.
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
        consuma_turno = TRUE;

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- Offerta: stesso controllo. Vale anche per le offerte in delega, che passano
-- di qui con la squadra delegata.
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
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri (%).',
            COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3);
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
            'ts', now()
        )
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$;


-- -----------------------------------------------------------------------------
-- Avvio d'ufficio: chi va in testa alla base non deve avere il reparto pieno,
-- altrimenti la chiusura si rifiuterebbe di assegnarglielo.
-- -----------------------------------------------------------------------------
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
        consuma_turno = v_consuma;

    RETURN json_build_object(
        'success', true,
        'squadra_in_testa', v_testa,
        'prezzo', v_quotazione,
        'consuma_turno', v_consuma
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- Chiusura: ultima rete di sicurezza, accanto a quella sulla rosa piena.
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
-- Buste: è il punto più importante. Si selezionano esattamente gli slot liberi
-- e si possono vincere tutti, quindi una lista con troppi portieri è già
-- illegale nel momento in cui viene salvata.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_buste(p_giocatori_ids INTEGER[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_slot_occupati INTEGER;
    v_crediti_residui INTEGER;
    v_slot_totali INTEGER;
    v_slot_liberi INTEGER;
    v_costo_totale INTEGER;
    v_count_selezionati INTEGER;
    v_count_liberi INTEGER;
    v_turno INTEGER;
    v_portieri_scelti INTEGER;
    v_portieri_ok INTEGER;
BEGIN
    v_squadra_id := public.mia_squadra_id();
    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    IF NOT COALESCE((SELECT fase_buste_aperta FROM public.regole_lega LIMIT 1), false) THEN
        RAISE EXCEPTION 'La fase di inserimento buste è chiusa.';
    END IF;

    SELECT slot_totali, turno_buste INTO v_slot_totali, v_turno
    FROM public.regole_lega LIMIT 1;
    v_slot_totali := COALESCE(v_slot_totali, 30);
    v_turno := COALESCE(v_turno, 1);

    SELECT slot_occupati, crediti_residui INTO v_slot_occupati, v_crediti_residui
    FROM public.squadre WHERE id = v_squadra_id;

    v_slot_liberi := v_slot_totali - v_slot_occupati;
    v_count_selezionati := COALESCE(array_length(p_giocatori_ids, 1), 0);

    IF v_slot_liberi <= 0 THEN
        RAISE EXCEPTION 'La tua rosa è già completa (% giocatori).', v_slot_totali;
    END IF;

    IF v_count_selezionati != v_slot_liberi THEN
        RAISE EXCEPTION 'Devi selezionare esattamente % giocatori. Ne hai selezionati %.',
            v_slot_liberi, v_count_selezionati;
    END IF;

    SELECT count(*), COALESCE(SUM(quotazione), 0)
    INTO v_count_liberi, v_costo_totale
    FROM public.giocatori
    WHERE id = ANY(p_giocatori_ids) AND stato = 'LIBERO' AND NOT fuori_lista;

    IF v_count_liberi != v_count_selezionati THEN
        RAISE EXCEPTION 'Uno o più giocatori selezionati non sono disponibili.';
    END IF;

    IF v_costo_totale > v_crediti_residui THEN
        RAISE EXCEPTION 'Il costo totale delle selezioni (%) supera i crediti residui (%).',
            v_costo_totale, v_crediti_residui;
    END IF;

    SELECT count(*) INTO v_portieri_scelti
    FROM public.giocatori WHERE id = ANY(p_giocatori_ids) AND ruolo = 'P';

    v_portieri_ok := public.portieri_disponibili(v_squadra_id);

    IF v_portieri_scelti > v_portieri_ok THEN
        RAISE EXCEPTION 'Hai selezionato % portieri ma puoi ancora prenderne %.',
            v_portieri_scelti, v_portieri_ok;
    END IF;

    DELETE FROM public.buste
    WHERE squadra_id = v_squadra_id AND esito = 'ATTESA' AND turno = v_turno;

    INSERT INTO public.buste (squadra_id, giocatore_id, turno)
    SELECT v_squadra_id, unnest(p_giocatori_ids), v_turno;

    RETURN json_build_object('success', true, 'turno', v_turno);
END;
$$;


-- -----------------------------------------------------------------------------
-- Spoglio: un richiedente unico non si aggiudica il portiere se nel frattempo
-- ha saturato il reparto. Stesso trattamento della rosa completa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_elabora_buste()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_g RECORD;
    v_s RECORD;
    v_prezzo INTEGER;
    v_assegnati INTEGER := 0;
    v_contesi INTEGER := 0;
    v_turno INTEGER;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso negato.'; END IF;

    SELECT turno_buste INTO v_turno FROM public.regole_lega LIMIT 1;
    v_turno := COALESCE(v_turno, 1);

    FOR v_g IN (
        SELECT giocatore_id, count(*) AS num_richieste, (array_agg(squadra_id))[1] AS sq_id
        FROM public.buste WHERE esito = 'ATTESA' AND turno = v_turno
        GROUP BY giocatore_id
    )
    LOOP
        IF v_g.num_richieste = 1
           AND NOT public.rosa_completa(v_g.sq_id)
           AND NOT public.ruolo_pieno(v_g.sq_id, v_g.giocatore_id) THEN
            SELECT quotazione INTO v_prezzo FROM public.giocatori WHERE id = v_g.giocatore_id;

            UPDATE public.squadre
            SET crediti_residui = crediti_residui - v_prezzo,
                slot_occupati = slot_occupati + 1
            WHERE id = v_g.sq_id;

            INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
            VALUES (v_g.sq_id, v_g.giocatore_id, v_prezzo)
            ON CONFLICT (giocatore_id) DO UPDATE
            SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

            UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = v_g.giocatore_id;
            UPDATE public.buste SET esito = 'VINTO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;

            v_assegnati := v_assegnati + 1;
        ELSIF v_g.num_richieste = 1 THEN
            UPDATE public.buste SET esito = 'PERSO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;
        ELSE
            FOR v_s IN (
                SELECT squadra_id FROM public.buste
                WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno
            )
            LOOP
                INSERT INTO public.liste_aste (giocatore_id, squadra_id)
                VALUES (v_g.giocatore_id, v_s.squadra_id)
                ON CONFLICT DO NOTHING;
            END LOOP;

            UPDATE public.buste SET esito = 'CONTESO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;

            v_contesi := v_contesi + 1;
        END IF;
    END LOOP;

    UPDATE public.regole_lega SET fase_buste_aperta = false WHERE id IS NOT NULL;

    RETURN json_build_object(
        'success', true, 'turno', v_turno,
        'assegnati', v_assegnati, 'contesi', v_contesi
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- Ballottaggio risolto a mano dall'admin: stesso limite.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_risolvi_busta_pari(
    p_giocatore_id INTEGER,
    p_squadra_vincente_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_busta_id UUID;
    v_prezzo INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può risolvere i ballottaggi.';
    END IF;

    IF public.rosa_completa(p_squadra_vincente_id) THEN
        RAISE EXCEPTION 'Rosa già completa: questa squadra non può aggiudicarsi altri giocatori.';
    END IF;

    IF public.ruolo_pieno(p_squadra_vincente_id, p_giocatore_id) THEN
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri (%).',
            COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3);
    END IF;

    SELECT id INTO v_busta_id
    FROM public.buste
    WHERE giocatore_id = p_giocatore_id
      AND squadra_id = p_squadra_vincente_id
      AND esito = 'CONTESO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nessuna busta CONTESO per questa squadra e questo giocatore.';
    END IF;

    SELECT quotazione INTO v_prezzo FROM public.giocatori WHERE id = p_giocatore_id;

    UPDATE public.buste SET esito = 'VINTO' WHERE id = v_busta_id;
    UPDATE public.buste SET esito = 'PERSO'
    WHERE giocatore_id = p_giocatore_id AND esito = 'CONTESO' AND id != v_busta_id;

    INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
    VALUES (p_squadra_vincente_id, p_giocatore_id, v_prezzo)
    ON CONFLICT (giocatore_id) DO UPDATE
    SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

    UPDATE public.squadre
    SET crediti_residui = crediti_residui - v_prezzo,
        slot_occupati = slot_occupati + 1
    WHERE id = p_squadra_vincente_id;

    UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = p_giocatore_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- Modifica del limite dalla dashboard, riservata al super admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_imposta_max_portieri(p_max INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN può cambiare il limite dei portieri.';
    END IF;

    IF p_max IS NULL OR p_max < 1 OR p_max > 10 THEN
        RAISE EXCEPTION 'Il numero massimo di portieri deve essere compreso fra 1 e 10.';
    END IF;

    UPDATE public.regole_lega SET slot_p = p_max WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'max_portieri', p_max);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_imposta_max_portieri(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
