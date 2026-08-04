-- =============================================================================
-- RPC — definizione unica e autoritativa
-- =============================================================================
-- Ogni funzione compare qui una sola volta. Nei fase*.sql alcune avevano fino a
-- cinque definizioni successive che si sovrascrivevano a vicenda con semantiche
-- incompatibili (admin_set_ruolo x5, hard_reset_sistema x4, chiudi_asta x3).
--
-- Convenzioni applicate a tutte:
--   * SECURITY DEFINER + SET search_path = public, pg_temp
--   * controllo di autorizzazione tramite is_admin() / is_super_admin()
--   * GRANT EXECUTE esplicito in fondo, senza affidarsi al default PUBLIC
-- =============================================================================


-- Si eliminano tutte le versioni preesistenti delle RPC prima di ricrearle.
--
-- Serve perché il database è stato costruito incollando SQL a mano, quindi le
-- stesse funzioni possono esistere con firme o tipi di ritorno diversi da quelli
-- attesi, e `CREATE OR REPLACE` non può cambiare il tipo di ritorno
-- (SQLSTATE 42P13). Casi reali riscontrati:
--   * `abbandona_asta` esisteva con un tipo di ritorno diverso;
--   * `piazza_offerta_asta` sopravviveva in due overload, quello a 2 argomenti
--     con la logica vecchia (nessuna delega, nessun controllo sugli abbandoni);
--   * `make_me_super_admin` (fase18) era escalation aperta a ogni utente.
--
-- Nota: is_admin(), is_super_admin() e mia_squadra_id() NON compaiono qui.
-- Sono create nella migration precedente e le policy RLS dipendono da loro:
-- eliminarle fallirebbe per dipendenza.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'calcola_massimo_offribile', 'avvia_asta_admin', 'prenota_chiamata',
        'avvia_timer_chiamata', 'piazza_offerta_asta', 'abbandona_asta',
        'avanza_turno_chiamata', 'genera_ordine_chiamata', 'chiudi_asta',
        'submit_buste', 'admin_toggle_buste', 'admin_elabora_buste',
        'admin_risolvi_busta_pari', 'admin_modifica_budget',
        'admin_annulla_acquisto', 'admin_set_ruolo', 'hard_reset_sistema',
        'import_giocatori_batch', 'make_me_super_admin'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.firma);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- Extra-budget
-- -----------------------------------------------------------------------------
-- Massimo offribile = crediti residui meno quanto serve a completare la rosa:
-- il valore base dei giocatori ancora nella propria lista di chiamata più il
-- costo minimo per gli slot che resterebbero scoperti.

CREATE OR REPLACE FUNCTION public.calcola_massimo_offribile(
    p_squadra_id UUID,
    p_giocatore_in_asta_id INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_budget_residuo INTEGER;
    v_slot_occupati INTEGER;
    v_slot_totali INTEGER;
    v_costo_minimo INTEGER;
    v_slot_liberi INTEGER;
    v_promesse_count INTEGER;
    v_promesse_costo INTEGER;
    v_slot_scoperti INTEGER;
BEGIN
    SELECT crediti_residui, slot_occupati INTO v_budget_residuo, v_slot_occupati
    FROM public.squadre WHERE id = p_squadra_id;

    IF v_budget_residuo IS NULL THEN
        RAISE EXCEPTION 'Squadra % non trovata.', p_squadra_id;
    END IF;

    SELECT slot_totali, costo_minimo_giocatore
    INTO v_slot_totali, v_costo_minimo
    FROM public.regole_lega LIMIT 1;

    -- regole_lega è garantita non vuota dalla migration di consolidamento,
    -- ma restiamo difensivi: senza questi default il risultato sarebbe NULL.
    v_slot_totali := COALESCE(v_slot_totali, 30);
    v_costo_minimo := COALESCE(v_costo_minimo, 1);

    v_slot_liberi := v_slot_totali - v_slot_occupati;

    SELECT COUNT(*), COALESCE(SUM(g.quotazione), 0)
    INTO v_promesse_count, v_promesse_costo
    FROM public.liste_aste la
    JOIN public.giocatori g ON la.giocatore_id = g.id
    WHERE la.squadra_id = p_squadra_id
      AND g.stato != 'TESSERATO'
      AND g.id != p_giocatore_in_asta_id;

    -- -1 è lo slot destinato al giocatore attualmente in asta.
    v_slot_scoperti := v_slot_liberi - 1 - v_promesse_count;
    IF v_slot_scoperti < 0 THEN v_slot_scoperti := 0; END IF;

    RETURN v_budget_residuo - (v_promesse_costo + (v_slot_scoperti * v_costo_minimo));
END;
$$;


-- -----------------------------------------------------------------------------
-- Asta live
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
BEGIN
    -- Il controllo era stato rimosso da 20260729211000_relax_admin.sql
    -- "temporaneamente, per i test in locale", e non era più stato rimesso.
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può avviare un''asta.';
    END IF;

    SELECT quotazione INTO v_quotazione FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        scadenza_corrente, squadra_in_testa, rilanci, abbandoni
    ) VALUES (
        p_giocatore_id, 'IN_CORSO', v_quotazione, v_quotazione,
        now() + (v_durata || ' seconds')::interval, NULL, '[]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'IN_CORSO',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = NULL,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb,
        scadenza_corrente = now() + (v_durata || ' seconds')::interval;

    RETURN json_build_object('success', true);
END;
$$;


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

    -- Rispetto del turno di chiamata, se un ordine è stato generato.
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

    -- L'ON CONFLICT era stato perso da fase7. Poiché aste.giocatore_id è UNIQUE,
    -- richiamare un giocatore già passato in asta sollevava unique_violation.
    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        squadra_in_testa, rilanci, abbandoni
    ) VALUES (
        p_giocatore_id, 'CHIAMATA', v_quotazione, v_quotazione,
        v_squadra_id, '[]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'CHIAMATA',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = NULL,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb;

    RETURN json_build_object('success', true);
END;
$$;


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

    RETURN json_build_object('success', true);
END;
$$;


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

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato != 'IN_CORSO' THEN RAISE EXCEPTION 'L''asta non è in corso.'; END IF;
    IF v_asta.scadenza_corrente < now() THEN RAISE EXCEPTION 'L''asta è scaduta!'; END IF;

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
        -- fase 20260730210000 aveva qui '\\%s', che stampava un backslash e una
        -- "s" di troppo invece dei valori.
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


-- Chiamata da TabelloneAsta.tsx ma mai definita in nessun file SQL: il pulsante
-- "Abbandona" restituiva sempre un errore di funzione inesistente.
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

    -- Chi è in testa non può ritirarsi: sta vincendo.
    IF v_asta.squadra_in_testa = v_squadra_id THEN
        RAISE EXCEPTION 'Non puoi abbandonare mentre sei in testa all''asta.';
    END IF;

    IF NOT (v_asta.abbandoni ? v_squadra_id::text) THEN
        UPDATE public.aste
        SET abbandoni = abbandoni || to_jsonb(v_squadra_id::text)
        WHERE id = p_asta_id;
    END IF;

    RETURN json_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.avanza_turno_chiamata()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ordine UUID[];
    v_indice INTEGER;
    v_len INTEGER;
    v_slot_totali INTEGER;
    v_valida BOOLEAN;
    v_tentativi INTEGER := 0;
BEGIN
    SELECT ordine_chiamata, indice_chiamata, slot_totali
    INTO v_ordine, v_indice, v_slot_totali
    FROM public.regole_lega LIMIT 1;

    v_len := array_length(v_ordine, 1);
    IF v_len IS NULL OR v_len = 0 THEN RETURN; END IF;

    v_slot_totali := COALESCE(v_slot_totali, 30);

    LOOP
        v_indice := v_indice + 1;
        IF v_indice > v_len THEN v_indice := 1; END IF;

        SELECT EXISTS (
            SELECT 1
            FROM public.squadre s
            JOIN public.liste_aste la ON s.id = la.squadra_id
            JOIN public.giocatori g ON la.giocatore_id = g.id
            WHERE s.id = v_ordine[v_indice]
              AND s.slot_occupati < v_slot_totali
              AND g.stato = 'LIBERO'
        ) INTO v_valida;

        v_tentativi := v_tentativi + 1;

        -- Si ferma sulla prima squadra valida, o dopo un giro completo se
        -- sono tutte piene o senza giocatori richiamabili.
        IF v_valida OR v_tentativi > v_len THEN
            UPDATE public.regole_lega SET indice_chiamata = v_indice WHERE id IS NOT NULL;
            RETURN;
        END IF;
    END LOOP;
END;
$$;


CREATE OR REPLACE FUNCTION public.genera_ordine_chiamata()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadre UUID[];
    v_slot_totali INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può generare l''ordine di chiamata.';
    END IF;

    SELECT slot_totali INTO v_slot_totali FROM public.regole_lega LIMIT 1;
    v_slot_totali := COALESCE(v_slot_totali, 30);

    SELECT array_agg(id ORDER BY random()) INTO v_squadre
    FROM (
        SELECT DISTINCT s.id
        FROM public.squadre s
        JOIN public.liste_aste la ON s.id = la.squadra_id
        JOIN public.giocatori g ON la.giocatore_id = g.id
        WHERE s.slot_occupati < v_slot_totali AND g.stato = 'LIBERO'
    ) sub;

    v_squadre := COALESCE(v_squadre, '{}');

    UPDATE public.regole_lega
    SET ordine_chiamata = v_squadre, indice_chiamata = 1
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'ordine', v_squadre);
END;
$$;


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

    -- Il FOR UPDATE c'era in 20260729182500_asta_live.sql, fase7 lo aveva perso
    -- riscrivendo la funzione: senza lock due chiusure concorrenti possono
    -- scalare il budget due volte.
    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;

    IF v_asta.stato = 'CHIUSA' THEN
        RETURN json_build_object('success', true, 'message', 'Asta già chiusa.');
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
    END IF;

    UPDATE public.aste SET stato = 'CHIUSA' WHERE id = p_asta_id;

    -- Il giocatore è stato assegnato: toglilo dalle liste di chiamata altrui.
    DELETE FROM public.liste_aste WHERE giocatore_id = v_asta.giocatore_id;

    PERFORM public.avanza_turno_chiamata();

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- Buste a chiusa
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
BEGIN
    v_squadra_id := public.mia_squadra_id();
    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    -- COALESCE necessario: se regole_lega fosse vuota, `IF NOT NULL` sarebbe
    -- NULL e il controllo verrebbe scavalcato silenziosamente.
    IF NOT COALESCE((SELECT fase_buste_aperta FROM public.regole_lega LIMIT 1), false) THEN
        RAISE EXCEPTION 'La fase di inserimento buste è chiusa.';
    END IF;

    SELECT slot_totali INTO v_slot_totali FROM public.regole_lega LIMIT 1;
    v_slot_totali := COALESCE(v_slot_totali, 30);

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

    DELETE FROM public.buste WHERE squadra_id = v_squadra_id AND esito = 'ATTESA';

    INSERT INTO public.buste (squadra_id, giocatore_id)
    SELECT v_squadra_id, unnest(p_giocatori_ids);

    RETURN json_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_toggle_buste(p_stato BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso negato.'; END IF;
    UPDATE public.regole_lega SET fase_buste_aperta = p_stato WHERE id IS NOT NULL;
END;
$$;


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
BEGIN
    -- fase6 controllava `ruolo = 'ADMIN'`, escludendo di fatto il SUPER_ADMIN.
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso negato.'; END IF;

    FOR v_g IN (
        SELECT giocatore_id, count(*) AS num_richieste, (array_agg(squadra_id))[1] AS sq_id
        FROM public.buste WHERE esito = 'ATTESA'
        GROUP BY giocatore_id
    )
    LOOP
        IF v_g.num_richieste = 1 THEN
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
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA';

            v_assegnati := v_assegnati + 1;
        ELSE
            -- Più richieste sullo stesso giocatore: si va all'asta live.
            FOR v_s IN (
                SELECT squadra_id FROM public.buste
                WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA'
            )
            LOOP
                INSERT INTO public.liste_aste (giocatore_id, squadra_id)
                VALUES (v_g.giocatore_id, v_s.squadra_id)
                ON CONFLICT DO NOTHING;
            END LOOP;

            UPDATE public.buste SET esito = 'CONTESO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA';

            v_contesi := v_contesi + 1;
        END IF;
    END LOOP;

    UPDATE public.regole_lega SET fase_buste_aperta = false WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'assegnati', v_assegnati, 'contesi', v_contesi);
END;
$$;


-- fase9 la definiva usando buste.stato (la colonna è `esito`), buste.importo
-- (non esiste) e l'esito 'PERSO' (non era nell'enum): non poteva funzionare.
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

    SELECT id INTO v_busta_id
    FROM public.buste
    WHERE giocatore_id = p_giocatore_id
      AND squadra_id = p_squadra_vincente_id
      AND esito = 'CONTESO';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nessuna busta CONTESO per questa squadra e questo giocatore.';
    END IF;

    -- Nelle buste non c'è un importo: si acquista alla quotazione.
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
    DELETE FROM public.liste_aste WHERE giocatore_id = p_giocatore_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- Amministrazione
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_modifica_budget(p_squadra_id UUID, p_delta INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può modificare i budget.';
    END IF;

    UPDATE public.squadre
    SET crediti_residui = crediti_residui + p_delta
    WHERE id = p_squadra_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_annulla_acquisto(p_asta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può annullare gli acquisti.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;

    IF v_asta.stato != 'CHIUSA' THEN
        RAISE EXCEPTION 'Puoi annullare solo un''asta già CHIUSA.';
    END IF;

    IF v_asta.squadra_in_testa IS NOT NULL THEN
        UPDATE public.squadre
        SET crediti_residui = crediti_residui + v_asta.prezzo_corrente,
            slot_occupati = GREATEST(slot_occupati - 1, 0)
        WHERE id = v_asta.squadra_in_testa;
    END IF;

    DELETE FROM public.tesseramenti WHERE giocatore_id = v_asta.giocatore_id;
    DELETE FROM public.aste WHERE id = p_asta_id;
    UPDATE public.giocatori SET stato = 'LIBERO' WHERE id = v_asta.giocatore_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_set_ruolo(p_target_user_id UUID, p_nuovo_ruolo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ruolo public.ruolo_utente;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN può modificare i ruoli.';
    END IF;

    v_ruolo := p_nuovo_ruolo::public.ruolo_utente;

    -- Il SUPER_ADMIN si assegna solo via configurazione (regole_lega.super_admin_email),
    -- non promuovendo altri utenti dall'interfaccia.
    IF v_ruolo = 'SUPER_ADMIN' THEN
        RAISE EXCEPTION 'Il ruolo SUPER_ADMIN non è assegnabile da qui.';
    END IF;

    -- Impedisce al SUPER_ADMIN di declassare sé stesso e restare fuori.
    IF p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Non puoi modificare il tuo stesso ruolo.';
    END IF;

    UPDATE public.profili SET ruolo = v_ruolo WHERE id = p_target_user_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.hard_reset_sistema()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN può resettare il sistema.';
    END IF;

    -- Nessun TRUNCATE ... CASCADE su `squadre`: CASCADE propaga a tutte le
    -- tabelle che la referenziano ignorando ON DELETE SET NULL, e nella prima
    -- versione (fase8) svuotava anche `profili`, cancellando il SUPER_ADMIN.
    -- È l'origine dell'intera serie di script di ripristino fase11-fase21.
    TRUNCATE TABLE public.offerte CASCADE;
    TRUNCATE TABLE public.buste CASCADE;
    TRUNCATE TABLE public.tesseramenti CASCADE;
    TRUNCATE TABLE public.aste CASCADE;
    TRUNCATE TABLE public.liste_aste CASCADE;

    UPDATE public.profili SET squadra_id = NULL WHERE squadra_id IS NOT NULL;
    DELETE FROM public.squadre WHERE id IS NOT NULL;
    TRUNCATE TABLE public.giocatori CASCADE;

    -- Elimina gli utenti tranne il SUPER_ADMIN che sta eseguendo il reset.
    DELETE FROM auth.users
    WHERE id != v_uid
      AND id NOT IN (SELECT id FROM public.profili WHERE ruolo = 'SUPER_ADMIN');

    UPDATE public.regole_lega
    SET ordine_chiamata = '{}',
        indice_chiamata = 1,
        fase_buste_aperta = false
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'message', 'Hard reset completato.');
END;
$$;


-- -----------------------------------------------------------------------------
-- Import del listone
-- -----------------------------------------------------------------------------
-- Chiamata da src/app/admin/actions.ts ma mai definita: l'import del listone
-- falliva sempre. Riceve le righe dell'Excel già normalizzate lato server e in
-- una sola transazione popola giocatori e, dove il file indica FantaSquadra e
-- Costo, anche i tesseramenti delle rose già assegnate.
CREATE OR REPLACE FUNCTION public.import_giocatori_batch(payload JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row JSONB;
    v_squadra_id UUID;
    v_nome_squadra TEXT;
    v_costo INTEGER;
    v_giocatore_id INTEGER;
    v_giocatori INTEGER := 0;
    v_tesseramenti INTEGER := 0;
    v_squadre_mancanti TEXT[] := '{}';
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può importare il listone.';
    END IF;

    -- Import completo: si riparte da uno stato pulito di rose e liste.
    DELETE FROM public.tesseramenti WHERE id IS NOT NULL;
    UPDATE public.squadre SET slot_occupati = 0 WHERE id IS NOT NULL;

    FOR v_row IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        v_giocatore_id := (v_row->>'id')::INTEGER;
        CONTINUE WHEN v_giocatore_id IS NULL;

        INSERT INTO public.giocatori (
            id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra, fuori_lista, stato
        ) VALUES (
            v_giocatore_id,
            v_row->>'nome',
            (v_row->>'ruolo')::public.ruolo_giocatore,
            COALESCE(v_row->>'squadra', ''),
            COALESCE((v_row->>'quotazione')::INTEGER, 1),
            (v_row->>'eta')::INTEGER,
            CASE WHEN v_row->'ruolo_mantra' IS NULL OR jsonb_typeof(v_row->'ruolo_mantra') != 'array'
                 THEN NULL
                 ELSE ARRAY(SELECT jsonb_array_elements_text(v_row->'ruolo_mantra'))
            END,
            COALESCE((v_row->>'fuori_lista')::BOOLEAN, false),
            'LIBERO'
        )
        ON CONFLICT (id) DO UPDATE SET
            nome = EXCLUDED.nome,
            ruolo = EXCLUDED.ruolo,
            squadra = EXCLUDED.squadra,
            quotazione = EXCLUDED.quotazione,
            eta = EXCLUDED.eta,
            ruolo_mantra = EXCLUDED.ruolo_mantra,
            fuori_lista = EXCLUDED.fuori_lista,
            stato = 'LIBERO';

        v_giocatori := v_giocatori + 1;

        -- Rosa già assegnata nel file di origine.
        v_nome_squadra := NULLIF(trim(COALESCE(v_row->>'fantasquadra', '')), '');
        IF v_nome_squadra IS NOT NULL THEN
            SELECT id INTO v_squadra_id
            FROM public.squadre
            WHERE lower(nome) = lower(v_nome_squadra);

            IF v_squadra_id IS NULL THEN
                IF NOT (v_nome_squadra = ANY(v_squadre_mancanti)) THEN
                    v_squadre_mancanti := array_append(v_squadre_mancanti, v_nome_squadra);
                END IF;
            ELSE
                v_costo := COALESCE((v_row->>'costo')::INTEGER, 0);

                INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
                VALUES (v_squadra_id, v_giocatore_id, v_costo)
                ON CONFLICT (giocatore_id) DO UPDATE
                SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

                UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = v_giocatore_id;
                UPDATE public.squadre SET slot_occupati = slot_occupati + 1 WHERE id = v_squadra_id;

                v_tesseramenti := v_tesseramenti + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'giocatori', v_giocatori,
        'tesseramenti', v_tesseramenti,
        'squadre_non_trovate', to_jsonb(v_squadre_mancanti)
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- GRANT — nessun file del progetto ne aveva finora
-- -----------------------------------------------------------------------------
-- Ci si affidava al default EXECUTE TO PUBLIC. config.toml documenta però che
-- le nuove tabelle/funzioni non sono più esposte automaticamente: senza GRANT
-- espliciti, al primo re-provisioning ogni RPC risponderebbe 404.

REVOKE ALL ON FUNCTION public.hard_reset_sistema()                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_ruolo(UUID, TEXT)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_giocatori_batch(JSONB)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mia_squadra_id()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.calcola_massimo_offribile(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.avvia_asta_admin(INTEGER)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.prenota_chiamata(INTEGER)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.avvia_timer_chiamata(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.piazza_offerta_asta(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abbandona_asta(UUID, UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.avanza_turno_chiamata()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.genera_ordine_chiamata()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.chiudi_asta(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_buste(INTEGER[])                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_buste(BOOLEAN)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_elabora_buste()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_risolvi_busta_pari(INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_modifica_budget(UUID, INTEGER)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_annulla_acquisto(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ruolo(UUID, TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_reset_sistema()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_giocatori_batch(JSONB)           TO authenticated;


-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- `regole_lega` non era nella publication, eppure TabelloneAsta e la pagina
-- buste si sottoscrivono ai suoi cambiamenti: turno di chiamata e apertura
-- della fase buste non potevano propagarsi senza un refresh manuale.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['aste', 'offerte', 'buste', 'profili', 'regole_lega', 'squadre']
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
