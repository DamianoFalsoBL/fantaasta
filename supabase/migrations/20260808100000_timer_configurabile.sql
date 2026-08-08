-- Due contatori invece di uno, entrambi regolabili dalla dashboard.
--
-- Finora l'asta aveva un solo `durata_timer`, usato sia all'apertura sia dopo
-- ogni rilancio, e modificabile soltanto scrivendo a mano nel database.
-- Nella pratica servono due tempi diversi: largo all'inizio, perche' tutti si
-- accorgano che l'asta e' partita; stretto dopo, perche' una battuta d'asta non
-- si trascini.
--
-- Chi usa quale:
--
--   * apertura -> `durata_timer`
--       avvia_timer_chiamata()  (l'admin fa partire un'asta prenotata)
--       avvia_asta_admin()      (l'admin la fa partire direttamente)
--   * rilancio -> `durata_timer_rilancio`
--       piazza_offerta_asta()   (rilancio a mano)
--       risolvi_massimi()       (rilancio automatico di chi ha un tetto)
--
-- Solo queste due ultime vengono ridefinite qui, e in ognuna cambia una riga
-- sola: quella che legge il numero di secondi. Il resto del corpo e' copiato
-- alla lettera da 20260806230000_massimi_asta.sql, che ne teneva la versione
-- viva.


-- -----------------------------------------------------------------------------
-- 1. La colonna nuova
-- -----------------------------------------------------------------------------
ALTER TABLE public.regole_lega
  ADD COLUMN IF NOT EXISTS durata_timer_rilancio INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.regole_lega.durata_timer IS
  'Secondi del contatore alla prima chiamata, cioe'' all''avvio dell''asta.';
COMMENT ON COLUMN public.regole_lega.durata_timer_rilancio IS
  'Secondi del contatore dopo ogni rilancio, manuale o automatico.';

-- Aggiungere una colonna non deve cambiare come si comporta l'asta: si parte
-- copiando il valore in uso, e i due tempi si separano quando l'admin lo
-- decide dalla dashboard. Senza questa riga, il push accorcerebbe da solo il
-- contatore dei rilanci alla prima asta utile.
UPDATE public.regole_lega
SET durata_timer_rilancio = durata_timer
WHERE durata_timer_rilancio IS DISTINCT FROM durata_timer
  AND durata_timer IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Rilancio automatico di chi ha dichiarato un tetto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.risolvi_massimi(p_asta_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta       RECORD;
    v_rilancio   INTEGER;
    v_durata     INTEGER;
    v_vincitore  UUID;
    v_primo      INTEGER;
    v_secondo    INTEGER;
    v_base       INTEGER;
    v_nuovo      INTEGER;
BEGIN
    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;
    IF NOT FOUND OR v_asta.stato <> 'IN_CORSO' THEN RETURN; END IF;
    IF v_asta.scadenza_corrente IS NOT NULL AND v_asta.scadenza_corrente < now() THEN RETURN; END IF;

    -- L'unica riga cambiata: il rilancio automatico e' un rilancio, quindi
    -- ricarica il contatore corto.
    SELECT COALESCE(rilancio_minimo, 1), COALESCE(durata_timer_rilancio, 10)
    INTO v_rilancio, v_durata
    FROM public.regole_lega LIMIT 1;
    v_rilancio := COALESCE(v_rilancio, 1);
    v_durata   := COALESCE(v_durata, 10);

    -- Un tetto vale solo se la squadra può davvero onorarlo adesso: la capienza
    -- di spesa cambia man mano che si chiudono altre aste, e le guardie di
    -- dominio (ritiro, rosa piena, portieri, partecipazione) vanno rivalutate a
    -- ogni risoluzione, non solo quando il tetto viene dichiarato.
    SELECT
        (array_agg(squadra_id ORDER BY eff DESC, created_at ASC))[1],
        (array_agg(eff        ORDER BY eff DESC, created_at ASC))[1],
        COALESCE((array_agg(eff ORDER BY eff DESC, created_at ASC))[2], 0)
    INTO v_vincitore, v_primo, v_secondo
    FROM (
        SELECT m.squadra_id,
               m.created_at,
               LEAST(m.importo,
                     public.calcola_massimo_offribile(m.squadra_id, v_asta.giocatore_id)) AS eff
        FROM public.massimi_asta m
        WHERE m.asta_id = p_asta_id
          AND NOT (v_asta.abbandoni ? m.squadra_id::text)
          AND public.squadra_in_gara(v_asta.giocatore_id, m.squadra_id)
          AND NOT public.rosa_completa(m.squadra_id)
          AND NOT public.ruolo_pieno(m.squadra_id, v_asta.giocatore_id)
    ) v
    WHERE v.eff > 0;

    IF v_vincitore IS NULL THEN RETURN; END IF;

    -- Cifra da battere. Senza nessuno in testa si parte dalla base d'asta:
    -- `avvia_asta_admin` lascia `prezzo_corrente` già pari alla base, quindi
    -- non la si può usare come soglia o il primo tetto non scatterebbe mai.
    IF v_asta.squadra_in_testa IS NULL THEN
        v_base := v_asta.base_asta - v_rilancio;
    ELSE
        v_base := v_asta.prezzo_corrente;
    END IF;

    v_base  := GREATEST(v_base, v_secondo);
    v_nuovo := LEAST(v_primo, v_base + v_rilancio);

    -- Il tetto non basta a migliorare la situazione: nessuno rilancia contro
    -- sé stesso e nessuno pareggia un'offerta già sul tavolo.
    IF v_asta.squadra_in_testa IS NULL THEN
        IF v_nuovo < v_asta.base_asta THEN RETURN; END IF;
    ELSE
        IF v_nuovo <= v_asta.prezzo_corrente THEN RETURN; END IF;
    END IF;

    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_vincitore, v_nuovo, 'AUTOMATICO');

    UPDATE public.aste
    SET prezzo_corrente    = v_nuovo,
        squadra_in_testa   = v_vincitore,
        scadenza_corrente  = now() + (v_durata || ' seconds')::interval,
        rilanci = rilanci || jsonb_build_object(
            'squadra_id', v_vincitore,
            'importo', v_nuovo,
            'origine', 'AUTOMATICO',
            'ts', now()
        )
    WHERE id = p_asta_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Rilancio a mano
-- -----------------------------------------------------------------------------
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

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'Rosa già completa: questa squadra non può aggiudicarsi altri giocatori.';
    END IF;

    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asta non trovata.'; END IF;
    IF v_asta.stato != 'IN_CORSO' THEN RAISE EXCEPTION 'L''asta non è in corso.'; END IF;
    IF v_asta.scadenza_corrente < now() THEN RAISE EXCEPTION 'L''asta è scaduta!'; END IF;

    IF public.ruolo_pieno(v_squadra_id, v_asta.giocatore_id) THEN
        RAISE EXCEPTION 'Questa squadra ha già il numero massimo di portieri.';
    END IF;

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

    -- L'unica riga cambiata rispetto alla versione precedente.
    SELECT durata_timer_rilancio INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 10);

    INSERT INTO public.offerte (asta_id, squadra_id, importo, origine)
    VALUES (p_asta_id, v_squadra_id, p_importo, v_origine);

    UPDATE public.aste
    SET prezzo_corrente = p_importo,
        squadra_in_testa = v_squadra_id,
        scadenza_corrente = now() + (v_durata || ' seconds')::interval,
        rilanci = rilanci || jsonb_build_object(
            'squadra_id', v_squadra_id,
            'importo', p_importo,
            'origine', v_origine,
            'ts', now()
        )
    WHERE id = p_asta_id;

    -- Chi ha un tetto risponde qui, nella stessa transazione.
    PERFORM public.risolvi_massimi(p_asta_id);

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Regolazione dalla dashboard, riservata al super admin
-- -----------------------------------------------------------------------------
-- Stessa forma di admin_imposta_max_portieri: un solo punto d'ingresso, con i
-- limiti verificati qui e non nel browser.
CREATE OR REPLACE FUNCTION public.admin_imposta_timer(
    p_primo    INTEGER,
    p_rilancio INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN può cambiare i tempi del contatore.';
    END IF;

    -- Il minimo di tre secondi non e' pignoleria: sotto quella soglia il giro
    -- fra rilancio, scrittura e messaggio realtime ai quattordici client non
    -- fa in tempo a chiudersi, e l'asta finirebbe prima che qualcuno la veda.
    IF p_primo IS NULL OR p_primo < 3 OR p_primo > 600 THEN
        RAISE EXCEPTION 'I secondi della prima chiamata devono essere fra 3 e 600.';
    END IF;

    IF p_rilancio IS NULL OR p_rilancio < 3 OR p_rilancio > 600 THEN
        RAISE EXCEPTION 'I secondi dopo il rilancio devono essere fra 3 e 600.';
    END IF;

    UPDATE public.regole_lega
    SET durata_timer = p_primo, durata_timer_rilancio = p_rilancio
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'primo', p_primo, 'rilancio', p_rilancio);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_imposta_timer(INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
