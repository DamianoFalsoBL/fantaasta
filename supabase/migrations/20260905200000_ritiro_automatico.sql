-- Chi non può più rilanciare esce dall'asta da solo.
--
-- Chiesto il 5 settembre: «quando in un'asta si arriva a un numero di crediti
-- che supera il massimo di chi è in asta, quel manager va in *smetti* in
-- automatico».
--
-- ## Perché non bastava mostrarlo
--
-- Il client lo sapeva già: `TabelloneAsta` spegne i pulsanti e scrive «Il tuo
-- massimo (X cr) non arriva all'offerta minima». Ma restare *dentro* l'asta
-- senza poter fare niente ha due effetti che si vedono:
--
--   * la pastiglia continua a dire «in gara», e chi guarda crede che quel
--     manager stia ancora valutando;
--   * soprattutto, la chiusura anticipata non scatta. `isSoloLeft` conta i
--     contendenti che non hanno abbandonato: con uno che non può più offrire
--     ma non è segnato fuori, l'asta va comunque a scadenza di timer anche
--     quando l'esito è già deciso.
--
-- ## La regola
--
-- Esce chi **non potrebbe piazzare l'offerta minima adesso**, cioè esattamente
-- chi `piazza_offerta_asta` rifiuterebbe. Sono tre condizioni, non una, e sono
-- la stessa cosa vista da tre lati: crediti insufficienti, rosa completa,
-- reparto portieri pieno. Trattarne una sola avrebbe lasciato l'asta a
-- scadere lo stesso ogni volta che il contendente fermo era fermo per uno
-- degli altri due motivi.
--
-- **Chi è in testa non esce mai.** Chi guida non deve rilanciare per vincere:
-- il suo massimo può benissimo essere pari al prezzo che ha già offerto.
-- Segnarlo fuori vorrebbe dire dichiarare deserta un'asta che ha un vincitore.
--
-- ## Perché non serve un ripescaggio
--
-- Dentro una singola asta la capienza di spesa **non può crescere**: dipende da
-- crediti residui, slot liberi e giocatori ancora nella propria lista, e
-- nessuna delle tre cambia finché l'asta è aperta — ne può girare una sola per
-- volta, lo garantisce il controllo in `prenota_chiamata`. Quindi chi esce non
-- potrà rientrare, e non c'è nessun caso in cui questa funzione debba
-- rimettere dentro qualcuno. Se un giorno le aste diventassero simultanee,
-- **questa e' la prima cosa da rivedere.**
--
-- ## La soglia
--
-- `prezzo_corrente + 1`, e non `+ rilancio_minimo`, perché è quello che il
-- server accetta davvero: `piazza_offerta_asta` chiede `p_importo >
-- prezzo_corrente` e non consulta `rilancio_minimo` (quel valore serve ai
-- rilanci automatici in `risolvi_massimi`). Oggi coincidono, perché il minimo è
-- 1; usare la soglia più bassa delle due è comunque la scelta prudente, perché
-- l'errore da evitare è buttare fuori qualcuno che potrebbe ancora offrire.
--
-- Senza nessuno in testa il minimo è invece la base d'asta, come in
-- `piazza_offerta_asta` e come nel client (`offertaMinima`).


-- -----------------------------------------------------------------------------
-- 1. Il ritiro d'ufficio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ritira_chi_non_puo_piu(p_asta_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asta   RECORD;
    v_minimo INTEGER;
    v_sq     UUID;
    v_fuori  UUID[] := '{}';
BEGIN
    SELECT * INTO v_asta FROM public.aste WHERE id = p_asta_id FOR UPDATE;

    -- Solo ad asta viva: su una prenotata nessuno può ancora offrire, e
    -- buttare fuori qualcuno prima che il timer parta sarebbe prematuro.
    IF NOT FOUND OR v_asta.stato <> 'IN_CORSO' THEN RETURN 0; END IF;
    IF v_asta.scadenza_corrente IS NOT NULL AND v_asta.scadenza_corrente < now() THEN RETURN 0; END IF;

    IF v_asta.squadra_in_testa IS NULL THEN
        v_minimo := v_asta.base_asta;
    ELSE
        v_minimo := v_asta.prezzo_corrente + 1;
    END IF;

    -- I contendenti sono quelli che hanno il giocatore in lista: è la stessa
    -- fonte della fila «In gara» che si vede a schermo, così ciò che sparisce
    -- dalla fila è esattamente ciò che esce qui.
    FOR v_sq IN
        SELECT la.squadra_id
        FROM public.liste_aste la
        WHERE la.giocatore_id = v_asta.giocatore_id
          AND la.squadra_id IS DISTINCT FROM v_asta.squadra_in_testa
          AND NOT (v_asta.abbandoni ? la.squadra_id::text)
    LOOP
        IF public.rosa_completa(v_sq)
           OR public.ruolo_pieno(v_sq, v_asta.giocatore_id)
           OR public.calcola_massimo_offribile(v_sq, v_asta.giocatore_id) < v_minimo
        THEN
            v_fuori := array_append(v_fuori, v_sq);
        END IF;
    END LOOP;

    IF array_length(v_fuori, 1) IS NULL THEN RETURN 0; END IF;

    -- Il tetto va tolto come nel ritiro volontario: lasciarlo lì significa
    -- tenere in `massimi_asta` una promessa che non può più essere onorata.
    DELETE FROM public.massimi_asta
    WHERE asta_id = p_asta_id AND squadra_id = ANY(v_fuori);

    UPDATE public.aste
    SET abbandoni = abbandoni || to_jsonb(ARRAY(SELECT unnest(v_fuori)::text))
    WHERE id = p_asta_id;

    RETURN array_length(v_fuori, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ritira_chi_non_puo_piu(UUID) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. I tre punti in cui il prezzo si muove
-- -----------------------------------------------------------------------------
-- Il controllo va **dopo** che il prezzo si è assestato, quindi dopo
-- `risolvi_massimi`: un rilancio automatico può far salire ancora la cifra, e
-- controllare prima vorrebbe dire misurare su un prezzo già vecchio.
--
-- Non è messo dentro `risolvi_massimi` di proposito: quella funzione esce
-- presto in una mezza dozzina di casi — asta non più in corso, scaduta,
-- nessun tetto valido — e in quei casi il controllo verrebbe saltato proprio
-- quando il prezzo è appena cambiato per altra via. Sta nei punti d'ingresso,
-- che sono tre e si contano.
--
-- Corpi copiati alla lettera dalle rispettive ultime versioni. Cambia solo la
-- riga segnata con «NUOVO».


-- --- Offerta manuale: `20260808100000_timer_configurabile.sql` ---------------
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

    -- NUOVO
    PERFORM public.ritira_chi_non_puo_piu(p_asta_id);

    RETURN json_build_object('success', true, 'importo', p_importo);
END;
$$;


-- --- Dichiarazione di un tetto: `20260905160000_messaggio_pareggio.sql` -------
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
        -- NUOVO
        PERFORM public.ritira_chi_non_puo_piu(p_asta_id);
    END IF;

    RETURN json_build_object('success', true, 'massimo', p_importo);
END;
$$;


-- --- Avvio del timer: `20260808100000_timer_configurabile.sql` ----------------
CREATE OR REPLACE FUNCTION public.avvia_timer_chiamata(p_asta_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_durata INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo un admin può avviare il timer.';
    END IF;

    SELECT durata_timer INTO v_durata FROM public.regole_lega LIMIT 1;
    v_durata := COALESCE(v_durata, 60);

    UPDATE public.aste
    SET stato = 'IN_CORSO',
        scadenza_corrente = now() + (v_durata || ' seconds')::interval
    WHERE id = p_asta_id AND stato = 'CHIAMATA';

    PERFORM public.risolvi_massimi(p_asta_id);

    -- NUOVO. Qui vale anche al prezzo di partenza: chi non arriva alla base
    -- non potrà offrire nemmeno una volta, e tenerlo «in gara» fa scadere il
    -- timer su un'asta il cui esito è già deciso.
    PERFORM public.ritira_chi_non_puo_piu(p_asta_id);

    RETURN json_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
