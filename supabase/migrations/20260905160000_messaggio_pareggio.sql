-- Il rifiuto di un pareggio spiega la regola invece di enunciarla.
--
-- Segnalato dal campo il 5 settembre: «se due manager mettono il rilancio
-- automatico con lo stesso importo, al secondo il sistema non lo lascia mettere
-- e non capisce perche'».
--
-- Il messaggio diceva «Il massimo deve superare il prezzo corrente (50)». E'
-- vero, ma e' la regola enunciata, non spiegata: chi legge si chiede perche'
-- non possa dichiarare proprio la cifra che e' disposto a spendere. La ragione
-- e' che a parita' non si passa — resta in testa chi ci e' arrivato prima — e
-- non stava scritta da nessuna parte.
--
-- Il prezzo corrente e' pubblico e si vede a schermo, quindi il messaggio nuovo
-- non rivela niente di piu' di quello vecchio: nessun tetto altrui trapela.
--
-- **La meta' piu' importante di questa correzione sta fuori dal database.** Il
-- campo del massimo aveva `min = prezzo + 1`, quindi il rifiuto che il manager
-- vedeva non era nemmeno il nostro: era il fumetto nativo del browser, nella
-- lingua del browser («Value must be greater than or equal to 51»). La
-- richiesta non partiva, e nessun messaggio nostro poteva arrivargli. Vedi il
-- commento su quel campo in `src/components/TabelloneAsta.tsx`.
--
-- Corpo copiato alla lettera da `20260806230000_massimi_asta.sql`: cambia solo
-- il testo dell'eccezione, segnato con «CAMBIATO».


CREATE OR REPLACE FUNCTION public.imposta_massimo_asta(
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
    v_massimo INTEGER;
BEGIN
    v_squadra_id := public.mia_squadra_id();

    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può impostare un massimo in delega.';
        END IF;
        v_squadra_id := p_squadra_delega;
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Squadra non trovata.';
    END IF;

    IF p_importo IS NULL OR p_importo <= 0 THEN
        RAISE EXCEPTION 'Il massimo deve essere un importo positivo.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;

    -- Guardia più larga di quella delle offerte, che pretendono 'IN_CORSO':
    -- su un'asta prenotata il tetto si può già dichiarare, e scatterà quando
    -- l'admin avvia il timer. È il momento naturale per farlo e allontanarsi.
    IF v_asta.stato NOT IN ('CHIAMATA', 'IN_CORSO') THEN
        RAISE EXCEPTION 'L''asta non è più attiva.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'Rosa già completa: questa squadra non può aggiudicarsi altri giocatori.';
    END IF;

    IF public.ruolo_pieno(v_squadra_id, v_asta.giocatore_id) THEN
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri.';
    END IF;

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
    END IF;

    IF v_asta.abbandoni ? v_squadra_id::text THEN
        RAISE EXCEPTION 'Hai abbandonato questa asta, non puoi impostare un massimo.';
    END IF;

    IF p_importo < v_asta.base_asta THEN
        RAISE EXCEPTION 'Il massimo deve essere almeno pari alla base d''asta (%).', v_asta.base_asta;
    END IF;

    -- CAMBIATO: solo il messaggio. Diceva «Il massimo deve superare il prezzo
    -- corrente», che e' la regola enunciata, non spiegata: chi legge si chiede
    -- perche' non possa dichiarare la cifra che e' disposto a spendere. La
    -- ragione e' che a parita' non si passa, e non stava scritta da nessuna
    -- parte. Il prezzo corrente e' pubblico, quindi qui non si rivela nulla
    -- che non si veda gia' a schermo.
    IF v_asta.squadra_in_testa IS NOT NULL
       AND v_asta.squadra_in_testa <> v_squadra_id
       AND p_importo <= v_asta.prezzo_corrente THEN
        RAISE EXCEPTION
            'A % crediti pareggeresti un''offerta gia'' sul tavolo, e a parita'' resta in testa chi ci e'' arrivato prima: per passare servono almeno % crediti.',
            p_importo, v_asta.prezzo_corrente + COALESCE((SELECT rilancio_minimo FROM public.regole_lega LIMIT 1), 1);
    END IF;

    v_massimo := public.calcola_massimo_offribile(v_squadra_id, v_asta.giocatore_id);
    IF p_importo > v_massimo THEN
        RAISE EXCEPTION 'Massimo (%) superiore a quanto questa squadra può offrire (%).',
            p_importo, v_massimo;
    END IF;

    INSERT INTO public.massimi_asta (asta_id, squadra_id, importo)
    VALUES (p_asta_id, v_squadra_id, p_importo)
    ON CONFLICT (asta_id, squadra_id) DO UPDATE
    SET importo = EXCLUDED.importo, created_at = now();

    -- Ad asta prenotata si registra soltanto: risolvere adesso farebbe salire
    -- il prezzo prima ancora che l'asta cominci, togliendo a chi ha chiamato il
    -- diritto di partire dalla base.
    IF v_asta.stato = 'IN_CORSO' THEN
        PERFORM public.risolvi_massimi(p_asta_id);
    END IF;

    RETURN json_build_object('success', true, 'massimo', p_importo);
END;
$$;

NOTIFY pgrst, 'reload schema';
