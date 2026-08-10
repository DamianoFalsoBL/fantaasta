-- I trasferimenti da fase a funzione.
--
-- Il mercato era nato sul modello della fase buste: un interruttore in
-- /admin/riepilogo, e a fase chiusa le pagine restavano al loro posto con i
-- comandi disabilitati. Ma i trasferimenti non sono una fase del gioco: per
-- gran parte della stagione non esistono, e vanno accesi e spenti come una
-- funzione, dalla pagina del super admin.
--
-- La colonna `fase_mercato_aperta` NON viene rinominata: costerebbe di toccare
-- sei punti fra migration e client per un guadagno solo estetico. Cambia il
-- significato, non il nome, e lo dice il commento.

COMMENT ON COLUMN public.regole_lega.fase_mercato_aperta IS
  'Funzione trasferimenti attiva. Da spenta le pagine spariscono dai menu e le RPC rifiutano. Si accende dal super admin in /admin/setup.';


-- -----------------------------------------------------------------------------
-- 1. La falla: imposta_vetrina non guardava il flag
-- -----------------------------------------------------------------------------
-- A mercato chiuso un manager poteva mettere un giocatore in vetrina chiamando
-- la RPC direttamente dalla console: i pulsanti nascosti nell'interfaccia non
-- proteggevano nulla. Nascondere i comandi senza chiudere la porta qui sarebbe
-- stato teatro.
--
-- Il resto del corpo e' copiato alla lettera da 20260807100000_trasferimenti.sql.
CREATE OR REPLACE FUNCTION public.imposta_vetrina(
    p_giocatore_id INTEGER,
    p_in_vendita   BOOLEAN,
    p_prezzo       INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mia UUID;
BEGIN
    -- L'unica aggiunta rispetto alla versione precedente.
    IF NOT COALESCE((SELECT fase_mercato_aperta FROM public.regole_lega LIMIT 1), false) THEN
        RAISE EXCEPTION 'I trasferimenti non sono attivi.';
    END IF;

    v_mia := public.mia_squadra_id();
    IF v_mia IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al tuo profilo.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tesseramenti
        WHERE giocatore_id = p_giocatore_id AND squadra_id = v_mia
    ) THEN
        RAISE EXCEPTION 'Questo giocatore non fa parte della tua rosa.';
    END IF;

    IF p_in_vendita AND p_prezzo IS NOT NULL AND p_prezzo < 0 THEN
        RAISE EXCEPTION 'Il prezzo richiesto non puo'' essere negativo.';
    END IF;

    UPDATE public.tesseramenti
    SET in_vendita       = COALESCE(p_in_vendita, false),
        -- Togliere dalla vetrina azzera anche il prezzo: lasciarlo li' farebbe
        -- riapparire una vecchia richiesta al rientro in lista.
        prezzo_richiesto = CASE WHEN COALESCE(p_in_vendita, false) THEN p_prezzo ELSE NULL END
    WHERE giocatore_id = p_giocatore_id AND squadra_id = v_mia;

    RETURN json_build_object('success', true, 'in_vendita', COALESCE(p_in_vendita, false));
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Quante trattative resterebbero in sospeso
-- -----------------------------------------------------------------------------
-- Serve all'avviso mostrato prima di spegnere la funzione, perche' spegnendo
-- le trattative aperte diventano invisibili a tutti finche' non si riaccende.
--
-- SECURITY DEFINER e non una query dal client: la policy su
-- offerte_trasferimento lascia vedere a ciascuno solo le proprie trattative,
-- quindi un conteggio fatto dal browser del super admin — che non e' parte di
-- nessuna trattativa — restituirebbe sempre zero. Ed e' esattamente il numero
-- che non deve essere sbagliato.
CREATE OR REPLACE FUNCTION public.trattative_in_sospeso()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::INTEGER
    FROM public.offerte_trasferimento
    WHERE stato IN ('ATTESA', 'ACCETTATA');
$$;


-- -----------------------------------------------------------------------------
-- 3. L'interruttore passa al super admin
-- -----------------------------------------------------------------------------
-- Il comando vive ora in /admin/setup, che e' riservata al super admin: la
-- guardia deve dire la stessa cosa dell'interfaccia, altrimenti un admin
-- qualunque potrebbe ancora accendere e spegnere la funzione via RPC.
-- Stessa forma di admin_imposta_max_portieri e admin_imposta_timer.
CREATE OR REPLACE FUNCTION public.admin_toggle_mercato(p_stato BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accesso negato: solo il SUPER ADMIN puo'' attivare o disattivare i trasferimenti.';
    END IF;

    -- Spegnere nasconde, non cancella: vetrine e trattative restano dove sono
    -- e si ritrovano intatte alla riaccensione. Un tocco per sbaglio non deve
    -- costare il lavoro di quattordici persone.
    UPDATE public.regole_lega SET fase_mercato_aperta = COALESCE(p_stato, false) WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'attivi', COALESCE(p_stato, false));
END;
$$;

GRANT EXECUTE ON FUNCTION public.trattative_in_sospeso() TO authenticated;

NOTIFY pgrst, 'reload schema';
