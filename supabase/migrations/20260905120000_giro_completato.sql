-- Finito il giro, il turno si ferma e aspetta l'admin.
--
-- Chiesto il 5 settembre, da un problema vissuto in asta: quando l'ultimo
-- dell'ordine ha chiamato, il turno **torna da solo al primo**, che puo'
-- prenotare subito. L'admin deve correre a sorteggiare un ordine nuovo prima
-- che qualcuno chiami, e la fretta e' il momento in cui si sbaglia.
--
-- Ora, chiuso il giro, il turno si blocca. L'admin ha due strade: confermare
-- l'ordine com'e' (`admin_conferma_ordine`, un click e si riparte dallo
-- stesso) oppure sorteggiarne uno nuovo, che e' quello che si faceva prima.
--
-- ## Il punto che decide tutto: dove sta il ritorno a capo
--
-- «Giro finito» **non e'** «l'indice e' tornato a 1». Il ciclo di
-- `avanza_turno_chiamata` salta le squadre con la rosa piena o senza piu'
-- giocatori in lista, quindi il ritorno a capo puo' avvenire **superando** la
-- posizione 1 e fermandosi sulla 2 o sulla 3. Confrontando l'indice finale con
-- 1, il blocco non scatterebbe proprio nei giri in cui qualcuno ha gia'
-- finito, che sono la maggioranza verso la fine dell'asta — cioe' fallirebbe
-- quando serve di piu'.
--
-- Il flag si alza percio' **dentro il ramo che fa il ritorno a capo**, e viene
-- scritto insieme all'indice in un'unica UPDATE, quando il ciclo si ferma.
--
-- ## Chi lo abbassa
--
--   * `admin_conferma_ordine()`  — nuova, e' il pulsante «Conferma l'ordine»;
--   * `genera_ordine_chiamata()` — se si sorteggia, il giro nuovo parte;
--   * `admin_imposta_turno()`    — spostando il turno a mano l'admin sta gia'
--     decidendo lui: lasciare il flag alzato bloccherebbe un istante dopo il
--     turno che ha appena scelto;
--   * `hard_reset_sistema()`     — stessa dimenticanza gia' costata a
--     `turno_buste` il 2 settembre: il reset svuota tutto ma la riga di
--     `regole_lega` resta, e un flag alzato sopravviverebbe alla lega.
--
-- ## Chi lo rispetta
--
-- `prenota_chiamata`, **compresa la chiamata per conto di un assente**: passa
-- dalla stessa funzione, e l'admin che chiama per un altro non deve poter
-- scavalcare il proprio stesso blocco.
--
-- E `avvia_asta_admin`, che e' l'unica altra via per mettere un giocatore
-- all'asta: senza il controllo, l'admin metterebbe all'asta d'ufficio mentre
-- il giro e' fermo in attesa della sua conferma.
--
-- Tutti i corpi sono **copiati alla lettera** dalle rispettive ultime
-- versioni. Cambia solo quello che e' segnato con «NUOVO».


-- -----------------------------------------------------------------------------
-- 1. Il flag
-- -----------------------------------------------------------------------------
-- Stesso schema di `fase_mercato_aperta` (20260807100000_trasferimenti.sql).
ALTER TABLE public.regole_lega
  ADD COLUMN IF NOT EXISTS giro_da_confermare BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.regole_lega.giro_da_confermare IS
  'Il giro di chiamate e'' tornato a capo: nessuno puo'' chiamare finche'' l''admin non conferma l''ordine o ne sorteggia uno nuovo.';


-- -----------------------------------------------------------------------------
-- 2. L'avanzamento alza il flag quando torna a capo
-- -----------------------------------------------------------------------------
-- Corpo copiato da `20260801220200_rpc_consolidate.sql:375-422`.
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
    -- NUOVO
    v_giro_finito BOOLEAN := FALSE;
BEGIN
    SELECT ordine_chiamata, indice_chiamata, slot_totali
    INTO v_ordine, v_indice, v_slot_totali
    FROM public.regole_lega LIMIT 1;

    v_len := array_length(v_ordine, 1);
    IF v_len IS NULL OR v_len = 0 THEN RETURN; END IF;

    v_slot_totali := COALESCE(v_slot_totali, 30);

    LOOP
        v_indice := v_indice + 1;
        -- NUOVO: e' qui che il giro finisce, e da qui in poi resta finito
        -- anche se il ciclo prosegue saltando le squadre gia' a posto.
        IF v_indice > v_len THEN
            v_indice := 1;
            v_giro_finito := TRUE;
        END IF;

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
            UPDATE public.regole_lega
            SET indice_chiamata = v_indice,
                -- NUOVO. Solo in salita: un avanzamento che non torna a capo
                -- non deve sbloccare un giro gia' dichiarato finito.
                giro_da_confermare = giro_da_confermare OR v_giro_finito
            WHERE id IS NOT NULL;
            RETURN;
        END IF;
    END LOOP;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Il pulsante «Conferma l'ordine»
-- -----------------------------------------------------------------------------
-- Guardia sullo stampo di `admin_toggle_buste` (20260802180000_buste_turni.sql).
CREATE OR REPLACE FUNCTION public.admin_conferma_ordine()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può confermare l''ordine di chiamata.';
    END IF;

    UPDATE public.regole_lega SET giro_da_confermare = false WHERE id IS NOT NULL;

    RETURN json_build_object('success', true);
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Sorteggiare un ordine nuovo fa ripartire il giro
-- -----------------------------------------------------------------------------
-- Corpo copiato da `20260801220200_rpc_consolidate.sql:425-457`.
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
    SET ordine_chiamata = v_squadre,
        indice_chiamata = 1,
        -- NUOVO: l'ordine e' nuovo, quindi il giro riparte.
        giro_da_confermare = false
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'ordine', v_squadre);
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. Spostare il turno a mano vale come conferma
-- -----------------------------------------------------------------------------
-- Corpo copiato da `20260806200000_turno_consumato.sql:255-285`.
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

    UPDATE public.regole_lega
    SET indice_chiamata = v_pos,
        -- NUOVO: scegliendo a mano a chi tocca, l'admin ha gia' deciso. Senza
        -- questa riga il turno che ha appena impostato verrebbe bloccato un
        -- istante dopo dal suo stesso flag.
        giro_da_confermare = false
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'indice', v_pos);
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. Nessuno chiama a giro fermo
-- -----------------------------------------------------------------------------
-- Corpo copiato da `20260902140000_chiamata_per_conto.sql:45-124`.
CREATE OR REPLACE FUNCTION public.prenota_chiamata(
    p_giocatore_id INTEGER,
    p_squadra_delega UUID DEFAULT NULL
)
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
    -- NUOVO
    v_giro_da_confermare BOOLEAN;
BEGIN
    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può chiamare per conto di un''altra squadra.';
        END IF;
        v_squadra_id := p_squadra_delega;
    ELSE
        v_squadra_id := public.mia_squadra_id();
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'La rosa è già completa: non si possono chiamare altri giocatori.';
    END IF;

    IF public.ruolo_pieno(v_squadra_id, p_giocatore_id) THEN
        RAISE EXCEPTION 'Numero massimo di portieri già raggiunto (%).',
            COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3);
    END IF;

    SELECT ordine_chiamata, indice_chiamata, giro_da_confermare
    INTO v_ordine, v_indice, v_giro_da_confermare
    FROM public.regole_lega LIMIT 1;

    -- NUOVO: prima del controllo del turno, e con un messaggio che dice cosa
    -- manca invece di un rifiuto generico. Vale anche per la delega: l'admin
    -- che chiama per un assente non scavalca il proprio stesso blocco.
    IF COALESCE(v_giro_da_confermare, false) THEN
        RAISE EXCEPTION 'Il giro è finito: l''admin deve confermare l''ordine o sorteggiarne uno nuovo.';
    END IF;

    IF v_ordine IS NOT NULL AND array_length(v_ordine, 1) > 0 THEN
        IF v_ordine[v_indice] IS DISTINCT FROM v_squadra_id THEN
            RAISE EXCEPTION 'Non è il turno di questa squadra!';
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

    RETURN json_build_object('success', true, 'squadra_in_testa', v_squadra_id, 'prezzo', v_quotazione);
END;
$$;


-- -----------------------------------------------------------------------------
-- 7. Nemmeno l'admin mette all'asta d'ufficio a giro fermo
-- -----------------------------------------------------------------------------
-- Corpo copiato da `20260902120000_asta_admin_assegna_al_turno.sql`.
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

    -- NUOVO: subito dopo la guardia e prima di leggere l'ordine. Questa e'
    -- l'unica via che mette un giocatore all'asta senza passare da
    -- `prenota_chiamata`: senza il controllo, scavalcherebbe il blocco.
    IF COALESCE((SELECT giro_da_confermare FROM public.regole_lega LIMIT 1), false) THEN
        RAISE EXCEPTION 'Il giro è finito: conferma l''ordine o sorteggiane uno nuovo prima di avviare un''asta.';
    END IF;

    SELECT quotazione INTO v_quotazione FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    SELECT ordine_chiamata, COALESCE(indice_chiamata, 1)
    INTO v_ordine, v_indice
    FROM public.regole_lega LIMIT 1;

    v_len := COALESCE(array_length(v_ordine, 1), 0);

    -- Primo giro: chi ha il giocatore in lista chiamate ha la precedenza.
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

    -- Secondo giro, senza il vincolo della lista chiamate. Scatta solo se il
    -- primo non ha trovato nessuno: serve al caso in cui l'admin mette
    -- all'asta d'ufficio un giocatore che nessuno aveva chiamato.
    IF v_testa IS NULL AND v_len > 0 THEN
        FOR v_i IN 0 .. v_len - 1 LOOP
            v_pos := ((v_indice - 1 + v_i) % v_len) + 1;
            v_cand := v_ordine[v_pos];

            IF v_cand IS NOT NULL
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


-- -----------------------------------------------------------------------------
-- 8. Il reset azzera anche questo
-- -----------------------------------------------------------------------------
-- Corpo copiato alla lettera da `20260902130000_reset_azzera_turno_buste.sql`:
-- cambia una riga sola, dentro l'UPDATE finale. E' la funzione piu' distruttiva
-- dell'applicazione e non va riscritta a memoria.
--
-- Senza questa riga si ripeterebbe pari pari il difetto di `turno_buste`: il
-- reset svuota tutto, ma la riga di `regole_lega` resta dov'e' — e una lega
-- nuova nascerebbe con il giro gia' bloccato, senza che si capisca perche'.
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
        fase_buste_aperta = false,
        fase_mercato_aperta = false,
        turno_buste = 1,
        -- L'unica riga aggiunta.
        giro_da_confermare = false
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'message', 'Hard reset completato.');
END;
$$;

NOTIFY pgrst, 'reload schema';
