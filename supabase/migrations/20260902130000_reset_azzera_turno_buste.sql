-- L'hard reset azzera anche il contatore dei turni di buste.
--
-- `hard_reset_sistema` termina azzerando lo stato di gara in `regole_lega`:
-- ordine di chiamata, indice, fase buste e — dall'8 agosto — fase mercato.
-- `turno_buste` e' arrivata dopo il consolidamento
-- (`20260802180000_buste_turni.sql`) e quella riga non e' stata aggiornata.
--
-- Conseguenza: le buste vengono cancellate dal TRUNCATE, ma il contatore
-- resta dov'era. In una lega ricreata da zero la prima tornata si chiamerebbe
-- «Turno 10» invece di «Turno 1», e il numero comparirebbe cosi' nel Sommario
-- Buste — un numero che non corrisponde a niente, perche' i turni da 1 a 9 di
-- quella lega non sono mai esistiti.
--
-- **E' esattamente lo stesso difetto di `fase_mercato_aperta`**, e la
-- migration che lo corresse lo aveva anche previsto per iscritto: «sono due
-- fasi trattate in modo diverso dalla stessa funzione, ed e' il tipo di
-- differenza che poi qualcuno scopre nel momento sbagliato». Questa volta e'
-- stata notata guardando il Sommario Buste.
--
-- Controllate una per una tutte le colonne di `regole_lega`: `turno_buste` e'
-- l'ultima rimasta fuori. Le altre — budget_standard, costo_minimo_giocatore,
-- durata_timer, durata_timer_rilancio, rilancio_minimo, slot_a/c/d/p,
-- slot_totali, super_admin_email — sono **configurazione della lega**, non
-- stato di gara, e un reset non deve toccarle: chi resetta vuole ripartire con
-- le stesse regole, non riconfigurare tutto da capo.
--
-- Il corpo e' copiato alla lettera da `20260808120000_reset_chiude_mercato.sql`:
-- cambia una riga sola, dentro l'UPDATE finale. Questa e' la funzione piu'
-- distruttiva dell'applicazione e non va riscritta a memoria.

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
        fase_mercato_aperta = false,
        -- L'unica riga aggiunta. 1 e' il default della colonna, cioe' il
        -- valore con cui parte una lega mai giocata.
        turno_buste = 1
    WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'message', 'Hard reset completato.');
END;
$$;

NOTIFY pgrst, 'reload schema';
