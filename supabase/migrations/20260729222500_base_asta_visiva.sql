-- Aggiorniamo avvia_asta_admin per far partire il PREZZO CORRENTE dalla quotazione
CREATE OR REPLACE FUNCTION public.avvia_asta_admin(p_giocatore_id INTEGER)
RETURNS JSON AS $$
DECLARE
    v_quotazione INTEGER;
BEGIN
    SELECT quotazione INTO v_quotazione
    FROM public.giocatori
    WHERE id = p_giocatore_id;

    IF v_quotazione IS NULL THEN
        v_quotazione := 1;
    END IF;

    -- Inserisce l'asta (il prezzo_corrente PARTE dalla quotazione)
    INSERT INTO public.aste (
      giocatore_id, 
      stato, 
      base_asta, 
      prezzo_corrente, 
      scadenza_corrente,
      squadra_in_testa
    ) VALUES (
      p_giocatore_id,
      'IN_CORSO',
      v_quotazione,
      v_quotazione, -- <-- Modifica qui!
      now() + '60 seconds'::interval,
      NULL
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
      stato = 'IN_CORSO',
      base_asta = v_quotazione,
      prezzo_corrente = v_quotazione, -- <-- Modifica qui!
      squadra_in_testa = NULL,
      scadenza_corrente = now() + '60 seconds'::interval;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Aggiorniamo piazza_offerta_asta per permettere l'offerta pari al prezzo corrente SOLO se nessuno ha ancora fatto offerte
CREATE OR REPLACE FUNCTION public.piazza_offerta_asta(
    p_asta_id UUID,
    p_importo INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_squadra_id UUID;
    v_asta RECORD;
    v_massimo_offribile INTEGER;
    v_timer_durata INTEGER;
BEGIN
    SELECT squadra_id INTO v_squadra_id FROM public.profili WHERE id = auth.uid();

    IF v_squadra_id IS NULL THEN RAISE EXCEPTION 'Squadra non trovata.'; END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato != 'IN_CORSO' THEN RAISE EXCEPTION 'L''asta non è in corso.'; END IF;
    IF v_asta.scadenza_corrente < now() THEN RAISE EXCEPTION 'L''asta è scaduta!'; END IF;

    -- Logica per l'offerta minima
    IF v_asta.squadra_in_testa IS NULL THEN
        -- Nessuno ha ancora fatto offerte. L'utente può chiamare il giocatore alla base d'asta
        IF p_importo < v_asta.base_asta THEN
            RAISE EXCEPTION 'L''importo deve essere almeno pari alla base d''asta (%).', v_asta.base_asta;
        END IF;
    ELSE
        -- Qualcuno sta già vincendo, il rilancio deve superare il prezzo corrente
        IF p_importo <= v_asta.prezzo_corrente THEN
            RAISE EXCEPTION 'L''importo deve essere superiore al prezzo corrente (%).', v_asta.prezzo_corrente;
        END IF;
    END IF;

    v_massimo_offribile := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo_offribile THEN RAISE EXCEPTION 'Offerta supera il massimo offribile.'; END IF;

    SELECT durata_timer INTO v_timer_durata FROM public.regole_lega LIMIT 1;
    IF v_timer_durata IS NULL THEN v_timer_durata := 60; END IF;

    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_squadra_id, p_importo, 'MANAGER');

    UPDATE public.aste
    SET prezzo_corrente = p_importo,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = now() + (v_timer_durata || ' seconds')::interval
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
