-- Un'asta avviata dall'admin non resta senza assegnatario.
--
-- Finora `avvia_asta_admin` cercava chi mettere in testa **solo fra chi aveva
-- il giocatore in `liste_aste`**, partendo da quello di turno. Se nessuno lo
-- aveva chiamato — il caso normale quando l'admin mette all'asta d'ufficio un
-- giocatore che nessuno ha in lista — `squadra_in_testa` restava NULL: l'asta
-- partiva senza nessuno in testa, e se nessuno rilanciava si chiudeva senza
-- assegnare niente.
--
-- Ora, quando il primo giro non trova nessuno, se ne fa un secondo **senza il
-- vincolo della lista chiamate**, sempre partendo da chi e' di turno.
--
-- ## Perche' due giri e non uno solo togliendo il vincolo
--
-- Chi ha messo il giocatore nella propria lista chiamate ha diritto di
-- precedenza: e' quello che lo ha scelto. Con un giro solo, un giocatore che la
-- terza squadra dell'ordine aveva in lista finirebbe in testa alla prima
-- soltanto perche' e' il suo turno, e la lista chiamate non conterebbe piu'
-- niente. Il primo giro conserva quel diritto, il secondo copre il buco.
--
-- ## Cosa NON e' cambiato, di proposito
--
-- Gli altri tre controlli restano anche nel ripiego: rosa non completa, ruolo
-- non pieno, e massimo offribile sufficiente. Mettere in testa una squadra che
-- non puo' permettersi il giocatore sposterebbe il problema a `chiudi_asta`,
-- che poi rifiuterebbe o lascerebbe i crediti in rosso. Se **nessuno** puo'
-- prenderlo, `squadra_in_testa` resta NULL come prima: e' il caso in cui
-- davvero non c'e' un assegnatario possibile, e va lasciato visibile invece di
-- forzarlo.
--
-- Corpo copiato alla lettera da `20260806230000_massimi_asta.sql`: cambia solo
-- il blocco del secondo giro, segnato qui sotto.

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

    -- ------------------------------------------------------------------
    -- NUOVO: secondo giro, senza il vincolo della lista chiamate.
    --
    -- Scatta solo se il primo non ha trovato nessuno. Serve al caso in cui
    -- l'admin mette all'asta d'ufficio un giocatore che nessuno aveva chiamato:
    -- prima l'asta partiva senza nessuno in testa.
    -- ------------------------------------------------------------------
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

NOTIFY pgrst, 'reload schema';
