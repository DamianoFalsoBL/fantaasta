-- Chi è già in coda per l'asta non può finire in una busta.
--
-- Aperte le buste, i contesi entrano in `liste_aste` e restano lì finché
-- l'asta non li assegna. In quella finestra la loro colonna `giocatori.stato`
-- vale ancora 'LIBERO', perché il tesseramento avviene solo alla chiusura.
--
-- `submit_buste` guardava soltanto quella colonna. In un turno successivo un
-- manager poteva quindi mettere una busta su un giocatore già in coda: se
-- risultava richiedente unico, `admin_elabora_buste` glielo assegnava alla
-- quotazione, e le squadre che lo avevano conteso nel turno precedente lo
-- perdevano senza l'asta che stavano aspettando.
--
-- Il corpo è copiato alla lettera da 20260802180000_buste_turni.sql: cambiano
-- solo la SELECT di disponibilità e il messaggio di errore che la accompagna.

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
