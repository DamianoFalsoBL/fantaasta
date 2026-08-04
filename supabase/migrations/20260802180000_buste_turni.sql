-- Buste su più turni.
--
-- Due problemi impedivano un secondo turno di buste:
--   1. `buste` aveva UNIQUE(squadra_id, giocatore_id): chi al primo turno aveva
--      perso un giocatore non poteva richiederlo al secondo, perché la riga
--      PERSO restava e l'inserimento andava in violazione di vincolo.
--      `submit_buste` cancella infatti solo le righe ATTESA, non gli esiti.
--   2. Gli esiti dei turni precedenti si mescolavano ai nuovi nella pagina
--      /buste, senza modo di distinguerli.
--
-- Si aggiunge quindi un numero di turno, incrementato a ogni riapertura della
-- fase. Lo storico dei turni passati resta consultabile e separato.

ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS turno_buste INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.buste ADD COLUMN IF NOT EXISTS turno INTEGER NOT NULL DEFAULT 1;

-- Il vincolo diventa per turno: stesso giocatore richiedibile di nuovo dopo
-- averlo perso, ma non due volte nello stesso turno.
DO $$
DECLARE
  v_nome TEXT;
BEGIN
  SELECT conname INTO v_nome
  FROM pg_constraint
  WHERE conrelid = 'public.buste'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.buste DROP CONSTRAINT %I', v_nome);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS buste_squadra_giocatore_turno
  ON public.buste (squadra_id, giocatore_id, turno);


-- Aprire la fase avvia un nuovo turno; chiuderla non lo tocca, così l'admin
-- può chiudere e riaprire per correggere senza far scattare un turno nuovo.
CREATE OR REPLACE FUNCTION public.admin_toggle_buste(p_stato BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_gia_aperta BOOLEAN;
    v_ci_sono_esiti BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso negato.'; END IF;

    SELECT fase_buste_aperta INTO v_gia_aperta FROM public.regole_lega LIMIT 1;

    IF p_stato AND NOT COALESCE(v_gia_aperta, false) THEN
        -- Si passa da chiusa ad aperta: se il turno corrente ha già prodotto
        -- esiti, quel turno è concluso e se ne apre uno nuovo.
        SELECT EXISTS (
            SELECT 1 FROM public.buste b
            JOIN public.regole_lega r ON b.turno = r.turno_buste
            WHERE b.esito <> 'ATTESA'
        ) INTO v_ci_sono_esiti;

        IF v_ci_sono_esiti THEN
            UPDATE public.regole_lega SET turno_buste = turno_buste + 1 WHERE id IS NOT NULL;
        END IF;
    END IF;

    UPDATE public.regole_lega SET fase_buste_aperta = p_stato WHERE id IS NOT NULL;
END;
$$;


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

    SELECT count(*), COALESCE(SUM(quotazione), 0)
    INTO v_count_liberi, v_costo_totale
    FROM public.giocatori
    WHERE id = ANY(p_giocatori_ids) AND stato = 'LIBERO' AND NOT fuori_lista;

    IF v_count_liberi != v_count_selezionati THEN
        RAISE EXCEPTION 'Uno o più giocatori selezionati non sono disponibili.';
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


CREATE OR REPLACE FUNCTION public.admin_elabora_buste()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_g RECORD;
    v_s RECORD;
    v_prezzo INTEGER;
    v_assegnati INTEGER := 0;
    v_contesi INTEGER := 0;
    v_turno INTEGER;
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accesso negato.'; END IF;

    SELECT turno_buste INTO v_turno FROM public.regole_lega LIMIT 1;
    v_turno := COALESCE(v_turno, 1);

    FOR v_g IN (
        SELECT giocatore_id, count(*) AS num_richieste, (array_agg(squadra_id))[1] AS sq_id
        FROM public.buste WHERE esito = 'ATTESA' AND turno = v_turno
        GROUP BY giocatore_id
    )
    LOOP
        IF v_g.num_richieste = 1 AND NOT public.rosa_completa(v_g.sq_id) THEN
            SELECT quotazione INTO v_prezzo FROM public.giocatori WHERE id = v_g.giocatore_id;

            UPDATE public.squadre
            SET crediti_residui = crediti_residui - v_prezzo,
                slot_occupati = slot_occupati + 1
            WHERE id = v_g.sq_id;

            INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
            VALUES (v_g.sq_id, v_g.giocatore_id, v_prezzo)
            ON CONFLICT (giocatore_id) DO UPDATE
            SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

            UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = v_g.giocatore_id;
            UPDATE public.buste SET esito = 'VINTO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;

            v_assegnati := v_assegnati + 1;
        ELSIF v_g.num_richieste = 1 THEN
            -- Richiedente unico ma rosa nel frattempo completa: nessuna assegnazione.
            UPDATE public.buste SET esito = 'PERSO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;
        ELSE
            FOR v_s IN (
                SELECT squadra_id FROM public.buste
                WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno
            )
            LOOP
                INSERT INTO public.liste_aste (giocatore_id, squadra_id)
                VALUES (v_g.giocatore_id, v_s.squadra_id)
                ON CONFLICT DO NOTHING;
            END LOOP;

            UPDATE public.buste SET esito = 'CONTESO'
            WHERE giocatore_id = v_g.giocatore_id AND esito = 'ATTESA' AND turno = v_turno;

            v_contesi := v_contesi + 1;
        END IF;
    END LOOP;

    UPDATE public.regole_lega SET fase_buste_aperta = false WHERE id IS NOT NULL;

    RETURN json_build_object(
        'success', true, 'turno', v_turno,
        'assegnati', v_assegnati, 'contesi', v_contesi
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
