-- Il turno di chiamata deve avanzare solo quando qualcuno ha davvero chiamato.
--
-- `chiudi_asta` terminava sempre con `avanza_turno_chiamata()`, senza guardare
-- come l'asta fosse nata. Le due porte d'ingresso però non sono equivalenti:
--
--   prenota_chiamata  -> chiama la squadra di turno: il turno è suo e va speso
--   avvia_asta_admin  -> parte dal turno corrente e SCORRE l'ordine fino alla
--                        prima squadra che ha quel giocatore in lista, può
--                        permetterselo e non ha la rosa piena
--
-- Nel secondo caso, se lo scorrimento va oltre, la squadra di turno non ha
-- chiamato nulla e si vedeva comunque consumare il turno. Su una lega a 14
-- squadre significa saltare un giro a chi non ha fatto niente di male.
--
-- La riga dell'asta registra quindi se quell'asta consuma il turno, e la
-- chiusura avanza solo in quel caso. Il valore predefinito è TRUE: le aste già
-- chiuse mantengono il comportamento con cui sono state chiuse.
--
-- Si aggiunge inoltre `admin_imposta_turno`, che finora non esisteva: l'unico
-- modo di toccare il turno era `genera_ordine_chiamata`, che rimescola tutte e
-- 14 le squadre. Senza un comando puntuale, un disallineamento — per esempio
-- dopo l'annullamento di un acquisto — non era rimediabile se non rifacendo
-- il sorteggio.

ALTER TABLE public.aste
  ADD COLUMN IF NOT EXISTS consuma_turno BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.aste.consuma_turno IS
  'Vero se alla chiusura questa asta deve far avanzare indice_chiamata. Falso per le aste avviate dall''admin su un giocatore che la squadra di turno non aveva in lista.';


-- -----------------------------------------------------------------------------
-- Chiamata del manager: è il suo turno, quindi lo spende.
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
-- Avvio d'ufficio dell'admin: consuma il turno solo se chi va in testa è
-- proprio la squadra di turno, cioè se l'admin ha chiamato al posto suo.
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
        -- Giro completo a partire dal turno corrente.
        FOR v_i IN 0 .. v_len - 1 LOOP
            v_pos := ((v_indice - 1 + v_i) % v_len) + 1;
            v_cand := v_ordine[v_pos];

            IF v_cand IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM public.liste_aste
                   WHERE giocatore_id = p_giocatore_id AND squadra_id = v_cand
               )
               AND NOT public.rosa_completa(v_cand)
               AND public.calcola_massimo_offribile(v_cand, p_giocatore_id) >= v_quotazione
            THEN
                v_testa := v_cand;
                -- v_i = 0 significa che il candidato è la squadra di turno:
                -- l'admin ha chiamato al posto suo, quindi il turno si spende.
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
-- Chiusura: avanza il turno solo se l'asta lo consumava.
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
        -- La chiamata c'è comunque stata, anche se non ha prodotto un acquisto.
        IF v_asta.consuma_turno THEN PERFORM public.avanza_turno_chiamata(); END IF;
        RETURN json_build_object(
            'success', true,
            'message', 'Rosa del vincitore già completa: giocatore NON assegnato, resta libero.'
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
-- Comando manuale sul turno.
--
-- Non fa alcun controllo su rosa piena o liste esaurite: è un comando di
-- rimedio, e l'admin deve poter puntare a chi vuole. Il salto automatico delle
-- squadre non più valide resta compito di avanza_turno_chiamata().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_imposta_turno(p_squadra_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ordine UUID[];
    v_pos INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può spostare il turno.';
    END IF;

    SELECT ordine_chiamata INTO v_ordine FROM public.regole_lega LIMIT 1;

    IF v_ordine IS NULL OR array_length(v_ordine, 1) IS NULL THEN
        RAISE EXCEPTION 'Nessun ordine di chiamata impostato: sorteggialo prima.';
    END IF;

    v_pos := array_position(v_ordine, p_squadra_id);

    IF v_pos IS NULL THEN
        RAISE EXCEPTION 'Questa squadra non compare nell''ordine di chiamata.';
    END IF;

    UPDATE public.regole_lega SET indice_chiamata = v_pos WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'indice', v_pos);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_imposta_turno(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
