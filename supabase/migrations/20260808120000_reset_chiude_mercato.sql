-- L'hard reset chiude anche il mercato trasferimenti.
--
-- `hard_reset_sistema` termina azzerando lo stato di gara in regole_lega:
-- ordine di chiamata, indice e fase buste. `fase_mercato_aperta` e' arrivata
-- dopo, con la migration del mercato, e quella riga non e' stata aggiornata:
-- un reset eseguito a mercato aperto lasciava la lega nuova con il mercato
-- gia' aperto.
--
-- Non fa danni immediati — senza squadre non c'e' nulla da scambiare — ma sono
-- due fasi trattate in modo diverso dalla stessa funzione, ed e' il tipo di
-- differenza che poi qualcuno scopre nel momento sbagliato.
--
-- Il corpo e' copiato alla lettera da 20260801220200_rpc_consolidate.sql:
-- cambia una riga sola, dentro l'UPDATE finale. Questa e' la funzione piu'
-- distruttiva dell'applicazione e non va riscritta a memoria.
--
-- Le due tabelle del mercato non hanno invece bisogno di nulla: le loro chiavi
-- verso `squadre` e `giocatori` sono ON DELETE CASCADE, quindi la DELETE e la
-- TRUNCATE qui sotto le ripuliscono gia'. Verificato sul database l'8 agosto 2026.

CREATE OR REPLACE FUNCTION public.hard_reset_sistema()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN può resettare il sistema.';
    END IF;

    -- Nessun TRUNCATE ... CASCADE su `squadre`: CASCADE propaga a tutte le
    -- tabelle che la referenziano ignorando ON DELETE SET NULL, e nella prima
    -- versione (fase8) svuotava anche `profili`, cancellando il SUPER_ADMIN.
    -- È l'origine dell'intera serie di script di ripristino fase11-fase21.
    TRUNCATE TABLE public.offerte CASCADE;
    TRUNCATE TABLE public.buste CASCADE;
    TRUNCATE TABLE public.tesseramenti CASCADE;
    TRUNCATE TABLE public.aste CASCADE;
    TRUNCATE TABLE public.liste_aste CASCADE;

    UPDATE public.profili SET squadra_id = NULL WHERE squadra_id IS NOT NULL;
    DELETE FROM public.squadre WHERE id IS NOT NULL;
    TRUNCATE TABLE public.giocatori CASCADE;

    -- Elimina gli utenti tranne il SUPER_ADMIN che sta eseguendo il reset.
    DELETE FROM auth.users
    WHERE id != v_uid
      AND id NOT IN (SELECT id FROM public.profili WHERE ruolo = 'SUPER_ADMIN');

    UPDATE public.regole_lega
    SET ordine_chiamata = '{}',
        indice_chiamata = 1,
        fase_buste_aperta = false,
        -- L'unica riga aggiunta.
        fase_mercato_aperta = false
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'message', 'Hard reset completato.');
END;
$$;

NOTIFY pgrst, 'reload schema';
