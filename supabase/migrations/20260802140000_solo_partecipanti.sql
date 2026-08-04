-- Solo chi ha il giocatore nella propria lista può rilanciare o abbandonare.
--
-- Né `piazza_offerta_asta` né `abbandona_asta` verificavano che la squadra
-- fosse davvero in gara per quel giocatore. Con la delega un admin poteva
-- quindi offrire o ritirarsi per conto di una squadra estranea all'asta.
--
-- Regola applicata: se per quel giocatore esistono righe in `liste_aste`,
-- partecipano soltanto quelle squadre. Se non ne esiste nessuna l'asta è
-- aperta a tutti, così resta valido il caso in cui un admin avvia un'asta
-- libera con `avvia_asta_admin` su un giocatore che nessuno aveva in lista.

CREATE OR REPLACE FUNCTION public.squadra_in_gara(
    p_giocatore_id INTEGER,
    p_squadra_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_partecipanti INTEGER;
BEGIN
    SELECT count(*) INTO v_partecipanti
    FROM public.liste_aste WHERE giocatore_id = p_giocatore_id;

    IF v_partecipanti = 0 THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.liste_aste
        WHERE giocatore_id = p_giocatore_id AND squadra_id = p_squadra_id
    );
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

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
    END IF;

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

    IF NOT public.squadra_in_gara(v_asta.giocatore_id, v_squadra_id) THEN
        RAISE EXCEPTION 'Questa squadra non partecipa all''asta per questo giocatore.';
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

GRANT EXECUTE ON FUNCTION public.squadra_in_gara(INTEGER, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
