-- La busta deve contenere esattamente i portieri che mancano alla rosa.
--
-- Segnalato usando la funzione per davvero: una squadra con sei slot liberi e
-- un portiere ancora da prendere ha salvato sei giocatori di movimento. Il
-- salvataggio e' andato a buon fine, e a rosa completa quel portiere non si
-- sarebbe piu' potuto prendere: gli slot erano finiti.
--
-- Il vincolo esisteva solo come TETTO. `portieri_disponibili` dice quanti se ne
-- possono ancora prendere, e sia la pagina sia le altre funzioni lo usavano per
-- impedire di prenderne troppi. Il minimo non lo controllava nessuno: ne' la
-- pagina, ne' questa funzione.
--
-- Il controllo va qui e non solo nell'interfaccia perche' submit_buste e' una
-- RPC raggiungibile da chiunque abbia una sessione: la pagina puo' rendere
-- l'errore evidente prima, ma non e' lei a garantirlo.
--
-- Il corpo e' copiato alla lettera dalla versione in vigore
-- (20260819100000_buste_escludono_coda_asta.sql): l'unica aggiunta e' la
-- guardia sui portieri, piu' le due variabili che le servono. Riscriverlo a
-- memoria e' il modo classico di perdere una guardia che qualcuno aveva
-- aggiunto per un motivo.

CREATE OR REPLACE FUNCTION public.submit_buste(p_giocatori_ids INTEGER[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_slot_occupati INTEGER;
    v_crediti_residui INTEGER;
    v_slot_totali INTEGER;
    v_slot_liberi INTEGER;
    v_costo_totale INTEGER;
    v_count_selezionati INTEGER;
    v_count_liberi INTEGER;
    v_turno INTEGER;
    v_portieri_mancanti INTEGER;
    v_portieri_scelti INTEGER;
BEGIN
    v_squadra_id := public.mia_squadra_id();
    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    IF NOT COALESCE((SELECT fase_buste_aperta FROM public.regole_lega LIMIT 1), false) THEN
        RAISE EXCEPTION 'La fase di inserimento buste è chiusa.';
    END IF;

    SELECT slot_totali, turno_buste INTO v_slot_totali, v_turno
    FROM public.regole_lega LIMIT 1;
    v_slot_totali := COALESCE(v_slot_totali, 30);
    v_turno := COALESCE(v_turno, 1);

    SELECT slot_occupati, crediti_residui INTO v_slot_occupati, v_crediti_residui
    FROM public.squadre WHERE id = v_squadra_id;

    v_slot_liberi := v_slot_totali - v_slot_occupati;
    v_count_selezionati := COALESCE(array_length(p_giocatori_ids, 1), 0);

    IF v_slot_liberi <= 0 THEN
        RAISE EXCEPTION 'La tua rosa è già completa (% giocatori).', v_slot_totali;
    END IF;

    IF v_count_selezionati != v_slot_liberi THEN
        RAISE EXCEPTION 'Devi selezionare esattamente % giocatori. Ne hai selezionati %.',
            v_slot_liberi, v_count_selezionati;
    END IF;

    SELECT count(*), COALESCE(SUM(g.quotazione), 0)
    INTO v_count_liberi, v_costo_totale
    FROM public.giocatori g
    WHERE g.id = ANY(p_giocatori_ids)
      AND g.stato = 'LIBERO'
      AND NOT g.fuori_lista
      -- L'unica aggiunta rispetto alla versione precedente.
      --
      -- Si interroga liste_aste e non lo stato del giocatore proprio perché un
      -- conteso resta 'LIBERO' fino alla chiusura dell'asta: è quella la
      -- finestra scoperta.
      --
      -- Attenzione: liste_aste conserva di proposito le righe dei giocatori poi
      -- tesserati (vedi 20260802160000_annulla_ripristina_lista.sql), ma qui non
      -- fa differenza, perché il filtro sullo stato le esclude già.
      AND NOT EXISTS (
          SELECT 1 FROM public.liste_aste la WHERE la.giocatore_id = g.id
      );

    IF v_count_liberi != v_count_selezionati THEN
        RAISE EXCEPTION 'Uno o più giocatori selezionati non sono disponibili o sono già in coda per l''asta.';
    END IF;

    IF v_costo_totale > v_crediti_residui THEN
        RAISE EXCEPTION 'Il costo totale delle selezioni (%) supera i crediti residui (%).',
            v_costo_totale, v_crediti_residui;
    END IF;

    -- I portieri: quanti ne servono ancora e quanti se ne stanno chiedendo.
    --
    -- La busta riempie SEMPRE tutti gli slot liberi — lo impone il controllo
    -- qui sopra — quindi a fine turno la rosa sarà completa. Se i portieri
    -- chiesti non sono esattamente quelli che mancano, quella rosa completa
    -- avrà il numero sbagliato di portieri e non ci sarà piu' modo di
    -- rimediare: gli slot sono finiti.
    --
    -- Il tetto da solo non bastava. `portieri_disponibili` limitava il MASSIMO,
    -- e infatti l'interfaccia impediva di sceglierne troppi; nessuno pero'
    -- impediva di non sceglierne affatto, ne' qui ne' nella pagina. Una busta
    -- da sei giocatori senza il portiere che mancava e' stata accettata.
    SELECT public.portieri_disponibili(v_squadra_id) INTO v_portieri_mancanti;

    SELECT count(*) INTO v_portieri_scelti
    FROM public.giocatori g
    WHERE g.id = ANY(p_giocatori_ids) AND g.ruolo = 'P';

    IF v_portieri_scelti <> v_portieri_mancanti THEN
        RAISE EXCEPTION 'Devi scegliere esattamente % portier%: ne hai scelti %.',
            v_portieri_mancanti,
            CASE WHEN v_portieri_mancanti = 1 THEN 'e' ELSE 'i' END,
            v_portieri_scelti;
    END IF;

    -- Si riscrivono solo le proprie buste ancora in attesa del turno corrente:
    -- gli esiti dei turni passati restano come storico.
    DELETE FROM public.buste
    WHERE squadra_id = v_squadra_id AND esito = 'ATTESA' AND turno = v_turno;

    INSERT INTO public.buste (squadra_id, giocatore_id, turno)
    SELECT v_squadra_id, unnest(p_giocatori_ids), v_turno;

    RETURN json_build_object('success', true, 'turno', v_turno);
END;
$$;

NOTIFY pgrst, 'reload schema';
