-- Chiude il cerchio fra buste contese e asta live.
--
-- Quando due o più squadre chiedono lo stesso giocatore, `admin_elabora_buste`
-- marca le buste come CONTESO e manda il giocatore all'asta live. Finora però
-- quelle buste restavano CONTESO per sempre: nella pagina /buste il manager
-- continuava a leggere "spareggio live" senza mai sapere com'era finita.
--
-- Ora la chiusura dell'asta assegna l'esito definitivo: VINTO a chi se lo
-- aggiudica, PERSO agli altri. Se l'asta si chiude senza vincitore le buste
-- restano CONTESO, perché la contesa non è ancora risolta e il giocatore può
-- essere rimesso all'asta.

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

        -- Esito definitivo delle buste rimaste in ballottaggio su questo giocatore.
        UPDATE public.buste
        SET esito = CASE WHEN squadra_id = v_asta.squadra_in_testa THEN 'VINTO'::public.esito_busta
                         ELSE 'PERSO'::public.esito_busta END
        WHERE giocatore_id = v_asta.giocatore_id AND esito = 'CONTESO';
    END IF;

    UPDATE public.aste SET stato = 'CHIUSA' WHERE id = p_asta_id;

    -- Le righe di liste_aste restano: i filtri sullo stato del giocatore le
    -- escludono già ovunque, e servono a ripristinare la contesa in caso di
    -- annullamento dell'acquisto.

    PERFORM public.avanza_turno_chiamata();

    RETURN json_build_object('success', true);
END;
$$;


-- Annullare l'acquisto deve riportare indietro anche le buste: la contesa
-- torna aperta, quindi gli esiti VINTO/PERSO assegnati dall'asta vanno revocati.
CREATE OR REPLACE FUNCTION public.admin_annulla_acquisto(p_asta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta RECORD;
    v_in_lista INTEGER;
    v_buste INTEGER;
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

    -- Più buste sullo stesso giocatore significa che l'esito veniva da un
    -- ballottaggio: si riportano tutte a CONTESO. Una busta sola era invece una
    -- vittoria diretta dalle buste, senza asta, e non va toccata.
    SELECT count(*) INTO v_buste FROM public.buste WHERE giocatore_id = v_asta.giocatore_id;
    IF v_buste > 1 THEN
        UPDATE public.buste
        SET esito = 'CONTESO'
        WHERE giocatore_id = v_asta.giocatore_id AND esito IN ('VINTO', 'PERSO');
    END IF;

    -- Se nessuno ha più il giocatore in lista (aste chiuse prima della
    -- migration che conserva liste_aste) si reinserisce almeno l'ex vincitore,
    -- altrimenti il giocatore resterebbe invisibile e non si potrebbe rifare l'asta.
    SELECT count(*) INTO v_in_lista
    FROM public.liste_aste WHERE giocatore_id = v_asta.giocatore_id;

    IF v_in_lista = 0 AND v_asta.squadra_in_testa IS NOT NULL THEN
        INSERT INTO public.liste_aste (giocatore_id, squadra_id)
        VALUES (v_asta.giocatore_id, v_asta.squadra_in_testa)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
