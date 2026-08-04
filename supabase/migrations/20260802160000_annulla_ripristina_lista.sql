-- Annullare un acquisto deve rimettere il giocatore all'asta, non lasciarlo sospeso.
--
-- Finora `chiudi_asta` cancellava le righe di `liste_aste` del giocatore
-- assegnato. Di conseguenza `admin_annulla_acquisto` liberava il giocatore ma
-- nessuno lo aveva più in lista: spariva da /aste, dalla "Lista Chiamate" dei
-- manager e da "Prossime Chiamate" in regia, cioè dall'unico punto da cui
-- l'admin può far ripartire l'asta.
--
-- Le righe non vanno cancellate: tutti i consumatori filtrano già sullo stato
-- del giocatore (`avanza_turno_chiamata`, `genera_ordine_chiamata`,
-- `calcola_massimo_offribile`, la lista chiamate e la pagina /aste escludono i
-- TESSERATO). Conservandole si mantiene memoria di chi voleva quel giocatore, e
-- l'annullamento ripristina la contesa originale senza doverla ricostruire.

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
        PERFORM public.avanza_turno_chiamata();
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
    END IF;

    UPDATE public.aste SET stato = 'CHIUSA' WHERE id = p_asta_id;

    -- Nessuna cancellazione di liste_aste: il giocatore ora è TESSERATO e i
    -- filtri sullo stato lo escludono già ovunque.

    PERFORM public.avanza_turno_chiamata();

    RETURN json_build_object('success', true);
END;
$$;


-- Resta RETURNS VOID: cambiarlo darebbe 42P13 (cannot change return type),
-- e il chiamante non usa comunque il valore restituito.
CREATE OR REPLACE FUNCTION public.admin_annulla_acquisto(p_asta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta RECORD;
    v_in_lista INTEGER;
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

    -- Se nessuno ha più il giocatore in lista (aste chiuse prima di questa
    -- migration, quando le righe venivano cancellate) si reinserisce almeno
    -- l'ex vincitore: altrimenti il giocatore resterebbe invisibile sia ai
    -- manager sia alla regia, e non si potrebbe rifare l'asta.
    SELECT count(*) INTO v_in_lista
    FROM public.liste_aste WHERE giocatore_id = v_asta.giocatore_id;

    IF v_in_lista = 0 AND v_asta.squadra_in_testa IS NOT NULL THEN
        INSERT INTO public.liste_aste (giocatore_id, squadra_id)
        VALUES (v_asta.giocatore_id, v_asta.squadra_in_testa)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


-- Stessa correzione per i ballottaggi delle buste.
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

NOTIFY pgrst, 'reload schema';
