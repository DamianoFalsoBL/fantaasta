-- Enable Realtime for aste and offerte
alter publication supabase_realtime add table public.aste;
alter publication supabase_realtime add table public.offerte;

-- Funzione per piazzare un'offerta in totale sicurezza atomica
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
    -- 1. Identifica la squadra in base all'utente loggato (SICUREZZA: mai fidarsi del client)
    SELECT squadra_id INTO v_squadra_id
    FROM public.profili
    WHERE id = auth.uid();

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata per l''utente corrente.';
    END IF;

    -- 2. Lock della riga dell'asta per evitare race conditions concorrenti
    SELECT * INTO v_asta
    FROM public.aste
    WHERE id = p_asta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asta non trovata.';
    END IF;

    IF v_asta.stato != 'IN_CORSO' THEN
        RAISE EXCEPTION 'L''asta non è attualmente in corso.';
    END IF;

    -- Se è scaduta "logicamente" ma lo scheduler non è ancora passato, bloccala
    IF v_asta.scadenza_corrente < now() THEN
        RAISE EXCEPTION 'L''asta è scaduta!';
    END IF;

    -- 3. Verifica importo (deve essere > del prezzo corrente)
    IF p_importo <= v_asta.prezzo_corrente THEN
        RAISE EXCEPTION 'L''importo deve essere superiore al prezzo corrente (%).', v_asta.prezzo_corrente;
    END IF;

    -- 4. Verifica Massimo Offribile della squadra
    v_massimo_offribile := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo_offribile THEN
        RAISE EXCEPTION 'Offerta (\\%s) supera il massimo offribile (\\%s).', p_importo, v_massimo_offribile;
    END IF;

    -- 5. Recupera la durata del timer dalle regole (o usa default)
    SELECT durata_timer INTO v_timer_durata FROM public.regole_lega LIMIT 1;
    IF v_timer_durata IS NULL THEN v_timer_durata := 15; END IF;

    -- 6. Registra l'offerta
    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_squadra_id, p_importo, 'MANAGER');

    -- 7. Aggiorna lo stato dell'asta (prezzo, chi sta vincendo, proroga timer)
    UPDATE public.aste
    SET prezzo_corrente = p_importo,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = now() + (v_timer_durata || ' seconds')::interval
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Funzione per chiudere un'asta e tesserare il vincitore
CREATE OR REPLACE FUNCTION public.chiudi_asta(p_asta_id UUID)
RETURNS JSON AS $$
DECLARE
    v_asta RECORD;
BEGIN
    SELECT * INTO v_asta
    FROM public.aste
    WHERE id = p_asta_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asta non trovata.';
    END IF;

    IF v_asta.stato = 'CHIUSA' THEN
        RETURN json_build_object('success', true, 'message', 'Già chiusa');
    END IF;

    -- Se c'è un vincitore, effettua il tesseramento
    IF v_asta.squadra_in_testa IS NOT NULL THEN
        
        -- Inserisci in tesseramenti
        INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
        VALUES (v_asta.squadra_in_testa, v_asta.giocatore_id, v_asta.prezzo_corrente)
        ON CONFLICT (giocatore_id) DO UPDATE 
        SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

        -- Aggiorna stato giocatore
        UPDATE public.giocatori 
        SET stato = 'TESSERATO'
        WHERE id = v_asta.giocatore_id;

        -- Aggiorna slot squadra
        UPDATE public.squadre
        SET slot_occupati = slot_occupati + 1
        WHERE id = v_asta.squadra_in_testa;

    END IF;

    -- Imposta l'asta come CHIUSA
    UPDATE public.aste
    SET stato = 'CHIUSA'
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
