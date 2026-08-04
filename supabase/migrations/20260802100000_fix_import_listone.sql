-- Corregge l'autorizzazione di import_giocatori_batch.
--
-- La funzione veniva invocata dalla server action `importListone` tramite il
-- client con la chiave secret (service_role). In quel contesto `auth.uid()` è
-- NULL, quindi `public.is_admin()` restituiva sempre false e l'import moriva
-- con "Accesso negato: solo un admin può importare il listone".
--
-- Il controllo di ruolo corretto sta già in `src/app/admin/actions.ts`, che
-- verifica il SUPER_ADMIN con il client SSR *prima* di usare la service role.
-- Qui restano due difese:
--   1. nessun GRANT a `authenticated`, quindi la funzione non è raggiungibile
--      da PostgREST con la sessione di un utente normale;
--   2. il controllo `is_admin()` resta attivo, ma solo quando la chiamata
--      arriva con un utente autenticato (auth.uid() non nullo).

CREATE OR REPLACE FUNCTION public.import_giocatori_batch(payload JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row JSONB;
    v_squadra_id UUID;
    v_nome_squadra TEXT;
    v_costo INTEGER;
    v_giocatore_id INTEGER;
    v_giocatori INTEGER := 0;
    v_tesseramenti INTEGER := 0;
    v_squadre_mancanti TEXT[] := '{}';
BEGIN
    -- Con la service role auth.uid() è NULL: la chiamata arriva dalla server
    -- action, che ha già verificato il SUPER_ADMIN.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo un admin può importare il listone.';
    END IF;

    -- Import completo: si riparte da uno stato pulito di rose e liste.
    DELETE FROM public.tesseramenti WHERE id IS NOT NULL;
    UPDATE public.squadre SET slot_occupati = 0 WHERE id IS NOT NULL;

    FOR v_row IN SELECT * FROM jsonb_array_elements(payload)
    LOOP
        v_giocatore_id := (v_row->>'id')::INTEGER;
        CONTINUE WHEN v_giocatore_id IS NULL;

        INSERT INTO public.giocatori (
            id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra, fuori_lista, stato
        ) VALUES (
            v_giocatore_id,
            v_row->>'nome',
            (v_row->>'ruolo')::public.ruolo_giocatore,
            COALESCE(v_row->>'squadra', ''),
            COALESCE((v_row->>'quotazione')::INTEGER, 1),
            (v_row->>'eta')::INTEGER,
            CASE WHEN v_row->'ruolo_mantra' IS NULL OR jsonb_typeof(v_row->'ruolo_mantra') != 'array'
                 THEN NULL
                 ELSE ARRAY(SELECT jsonb_array_elements_text(v_row->'ruolo_mantra'))
            END,
            COALESCE((v_row->>'fuori_lista')::BOOLEAN, false),
            'LIBERO'
        )
        ON CONFLICT (id) DO UPDATE SET
            nome = EXCLUDED.nome,
            ruolo = EXCLUDED.ruolo,
            squadra = EXCLUDED.squadra,
            quotazione = EXCLUDED.quotazione,
            eta = EXCLUDED.eta,
            ruolo_mantra = EXCLUDED.ruolo_mantra,
            fuori_lista = EXCLUDED.fuori_lista,
            stato = 'LIBERO';

        v_giocatori := v_giocatori + 1;

        -- Rosa già assegnata nel file di origine.
        v_nome_squadra := NULLIF(trim(COALESCE(v_row->>'fantasquadra', '')), '');
        IF v_nome_squadra IS NOT NULL THEN
            SELECT id INTO v_squadra_id
            FROM public.squadre
            WHERE lower(nome) = lower(v_nome_squadra);

            IF v_squadra_id IS NULL THEN
                IF NOT (v_nome_squadra = ANY(v_squadre_mancanti)) THEN
                    v_squadre_mancanti := array_append(v_squadre_mancanti, v_nome_squadra);
                END IF;
            ELSE
                v_costo := COALESCE((v_row->>'costo')::INTEGER, 0);

                INSERT INTO public.tesseramenti (squadra_id, giocatore_id, prezzo_pagato)
                VALUES (v_squadra_id, v_giocatore_id, v_costo)
                ON CONFLICT (giocatore_id) DO UPDATE
                SET squadra_id = EXCLUDED.squadra_id, prezzo_pagato = EXCLUDED.prezzo_pagato;

                UPDATE public.giocatori SET stato = 'TESSERATO' WHERE id = v_giocatore_id;
                UPDATE public.squadre SET slot_occupati = slot_occupati + 1 WHERE id = v_squadra_id;

                v_tesseramenti := v_tesseramenti + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN json_build_object(
        'success', true,
        'giocatori', v_giocatori,
        'tesseramenti', v_tesseramenti,
        'squadre_non_trovate', to_jsonb(v_squadre_mancanti)
    );
END;
$$;

-- Raggiungibile solo con la service role, cioè solo dalla server action.
REVOKE ALL ON FUNCTION public.import_giocatori_batch(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_giocatori_batch(JSONB) FROM authenticated;

NOTIFY pgrst, 'reload schema';
