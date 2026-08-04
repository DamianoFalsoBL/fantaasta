-- 1. Aggiungiamo il nuovo stato 'CHIAMATA' all'ENUM
ALTER TYPE public.stato_asta ADD VALUE IF NOT EXISTS 'CHIAMATA';

-- 2. Correggiamo chiudi_asta per scalare il budget
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

    -- Se c'è un vincitore, effettua il tesseramento e SCALA IL BUDGET
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

        -- Aggiorna slot squadra e scala budget
        UPDATE public.squadre
        SET slot_occupati = slot_occupati + 1,
            crediti_residui = crediti_residui - v_asta.prezzo_corrente
        WHERE id = v_asta.squadra_in_testa;

    END IF;

    -- Imposta l'asta come CHIUSA
    UPDATE public.aste
    SET stato = 'CHIUSA'
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Nuova RPC prenota_chiamata per gli utenti
CREATE OR REPLACE FUNCTION public.prenota_chiamata(p_giocatore_id INTEGER)
RETURNS JSON AS $$
DECLARE
    v_squadra_id UUID;
    v_quotazione INTEGER;
    v_count INTEGER;
BEGIN
    -- Identifica la squadra dell'utente loggato
    SELECT squadra_id INTO v_squadra_id
    FROM public.profili
    WHERE id = auth.uid();

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    -- Controlla se c'è un'asta in corso o già in chiamata (può esserci solo 1 asta attiva per volta)
    SELECT count(*) INTO v_count FROM public.aste WHERE stato IN ('IN_CORSO', 'CHIAMATA');
    IF v_count > 0 THEN
        RAISE EXCEPTION 'C''è già un''asta in corso o in attesa di avvio.';
    END IF;

    -- Recupera la quotazione
    SELECT quotazione INTO v_quotazione
    FROM public.giocatori
    WHERE id = p_giocatore_id;
    
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    -- Inserisce l'asta in stato CHIAMATA e assegna subito l'utente come vincitore alla base d'asta
    INSERT INTO public.aste (
      giocatore_id, 
      stato, 
      base_asta, 
      prezzo_corrente, 
      scadenza_corrente,
      squadra_in_testa
    ) VALUES (
      p_giocatore_id,
      'CHIAMATA',
      v_quotazione,
      v_quotazione,
      now() + '60 seconds'::interval, -- il timer vero parte quando l'admin preme "Avvia", ma diamo un fallback
      v_squadra_id
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
      stato = 'CHIAMATA',
      base_asta = v_quotazione,
      prezzo_corrente = v_quotazione,
      squadra_in_testa = v_squadra_id,
      scadenza_corrente = now() + '60 seconds'::interval;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Modifica piazza_offerta_asta per supportare la Delega (p_squadra_delega)
CREATE OR REPLACE FUNCTION public.piazza_offerta_asta(
    p_asta_id UUID,
    p_importo INTEGER,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_squadra_id UUID;
    v_asta RECORD;
    v_massimo_offribile INTEGER;
    v_timer_durata INTEGER;
    v_is_admin BOOLEAN;
    v_origine public.origine_offerta;
BEGIN
    v_origine := 'MANAGER';

    -- Identifica la squadra dell'utente loggato
    SELECT squadra_id INTO v_squadra_id
    FROM public.profili
    WHERE id = auth.uid();

    -- Se è passata una delega, l'utente deve essere ADMIN
    IF p_squadra_delega IS NOT NULL THEN
        SELECT public.is_admin() INTO v_is_admin;
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'Solo un Admin può fare offerte in delega.';
        END IF;
        -- Override squadra con la delega
        v_squadra_id := p_squadra_delega;
        v_origine := 'ADMIN_PER_CONTO';
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    -- Lock della riga
    SELECT * INTO v_asta
    FROM public.aste
    WHERE id = p_asta_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato != 'IN_CORSO' THEN RAISE EXCEPTION 'L''asta non è in corso.'; END IF;
    IF v_asta.scadenza_corrente < now() THEN RAISE EXCEPTION 'L''asta è scaduta!'; END IF;

    -- Logica offerta minima
    IF v_asta.squadra_in_testa IS NULL THEN
        IF p_importo < v_asta.base_asta THEN
            RAISE EXCEPTION 'L''importo deve essere almeno pari alla base d''asta (%).', v_asta.base_asta;
        END IF;
    ELSE
        IF p_importo <= v_asta.prezzo_corrente THEN
            RAISE EXCEPTION 'L''importo deve essere superiore al prezzo corrente (%).', v_asta.prezzo_corrente;
        END IF;
    END IF;

    -- Verifica Massimo Offribile
    v_massimo_offribile := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo_offribile THEN
        RAISE EXCEPTION 'Offerta (\\%s) supera il massimo offribile (\\%s).', p_importo, v_massimo_offribile;
    END IF;

    -- Aggiorna il timer
    SELECT durata_timer INTO v_timer_durata FROM public.regole_lega LIMIT 1;
    IF v_timer_durata IS NULL THEN v_timer_durata := 60; END IF;

    -- Registra l'offerta con l'origine (MANAGER o ADMIN_PER_CONTO)
    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_squadra_id, p_importo, v_origine);

    -- Aggiorna lo stato dell'asta
    UPDATE public.aste
    SET prezzo_corrente = p_importo,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = now() + (v_timer_durata || ' seconds')::interval
    WHERE id = p_asta_id;

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. RPC per Avviare il timer da stato CHIAMATA a IN_CORSO
CREATE OR REPLACE FUNCTION public.avvia_timer_chiamata(p_asta_id UUID)
RETURNS JSON AS $$
DECLARE
    v_timer_durata INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Solo un Admin può avviare il timer.';
    END IF;

    SELECT durata_timer INTO v_timer_durata FROM public.regole_lega LIMIT 1;
    IF v_timer_durata IS NULL THEN v_timer_durata := 60; END IF;

    UPDATE public.aste
    SET stato = 'IN_CORSO',
        scadenza_corrente = now() + (v_timer_durata || ' seconds')::interval
    WHERE id = p_asta_id AND stato = 'CHIAMATA';

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
