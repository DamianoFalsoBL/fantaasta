-- Un'asta avviata dall'admin non deve poter restare senza nessuno in testa.
--
-- Le due porte d'ingresso all'asta si comportavano in modo diverso:
--
--   prenota_chiamata   -> chi chiama entra subito in testa alla base d'asta
--   avvia_asta_admin   -> squadra_in_testa = NULL, nessuno in testa
--
-- Da lì il caso osservato: l'admin avvia l'asta di un giocatore conteso,
-- nessuno rilancia entro il timer, `chiudi_asta` trova squadra_in_testa NULL
-- e chiude senza assegnare. Il giocatore resta LIBERO e nelle liste di chi lo
-- voleva, quindi ricompare fra le chiamate identico a uno mai chiamato: un
-- limbo da cui si esce solo rifacendo l'asta e sperando che stavolta qualcuno
-- offra.
--
-- Ora `avvia_asta_admin` individua chi *avrebbe chiamato* quel giocatore e lo
-- mette in testa alla base, esattamente come farebbe una chiamata normale.
-- Si parte dal turno corrente e si scorre l'ordine di chiamata in modo ciclico
-- fino alla prima squadra che soddisfa tutte e tre le condizioni:
--
--   1. ha il giocatore nella propria lista di chiamata;
--   2. non ha la rosa già completa — `chiudi_asta` rifiuterebbe comunque di
--      assegnarglielo, riportando al punto di partenza;
--   3. può permettersi la base, secondo `calcola_massimo_offribile`, che è la
--      stessa funzione con cui il server accetta o rifiuta un'offerta: mettere
--      in testa una squadra a una cifra che non potrebbe offrire sarebbe
--      incoerente.
--
-- Se nessuna squadra ha il giocatore in lista non c'è alcuna pretesa da
-- onorare: l'asta resta aperta a tutti senza nessuno in testa, come prima.
-- Un giocatore che nessuno ha messo in lista e che nessuno rilancia resta
-- semplicemente libero, ed è corretto così.

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
                EXIT;
            END IF;
        END LOOP;
    END IF;

    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        scadenza_corrente, squadra_in_testa, rilanci, abbandoni
    ) VALUES (
        p_giocatore_id, 'IN_CORSO', v_quotazione, v_quotazione,
        now() + (v_durata || ' seconds')::interval, v_testa, '[]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'IN_CORSO',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = v_testa,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb,
        scadenza_corrente = now() + (v_durata || ' seconds')::interval;

    RETURN json_build_object(
        'success', true,
        'squadra_in_testa', v_testa,
        'prezzo', v_quotazione
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
