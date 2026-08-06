-- Lista trasferimenti e offerte di scambio fra manager.
--
-- Finora un giocatore cambiava squadra solo passando da un'asta o da una busta.
-- Qui si aggiunge il mercato: chi vuole cedere mette un proprio giocatore in
-- vetrina, chiunque puo' fargli un'offerta, e l'offerta puo' essere fatta di
-- soldi, di calciatori, o di entrambi.
--
-- Uno scambio muove crediti, tesseramenti e slot di DUE squadre in un colpo
-- solo e -- a differenza di un'asta -- non ha un annullamento. Da qui le tre
-- scelte che reggono tutto il file:
--
--   1. nessuna scrittura diretta dai client: si passa solo dalle RPC qui sotto;
--   2. le guardie sono le stesse gia' usate dalle aste (rosa_completa,
--      portieri, capienza), riusate e non riscritte;
--   3. lo scambio lo esegue l'admin, dopo che il ricevente ha accettato.
--
-- Il calciomercato si svolge prima delle aste e non si sovrappone mai a esse:
-- il controllo sulle aste vive e' quindi un assertone di sicurezza, non uno
-- scenario previsto.


-- -----------------------------------------------------------------------------
-- 1. Apertura del mercato
-- -----------------------------------------------------------------------------
-- Stesso schema di `fase_buste_aperta`: un interruttore in mano all'admin.
ALTER TABLE public.regole_lega
  ADD COLUMN IF NOT EXISTS fase_mercato_aperta BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.regole_lega.fase_mercato_aperta IS
  'Mercato trasferimenti aperto: i manager possono mettere in vetrina e trattare.';


-- -----------------------------------------------------------------------------
-- 2. La vetrina
-- -----------------------------------------------------------------------------
-- Due colonne su `tesseramenti` e non una tabella a parte: la vetrina vive
-- sulla riga che rappresenta la proprieta', quindi non puo' andare fuori
-- sincrono con essa.
ALTER TABLE public.tesseramenti
  ADD COLUMN IF NOT EXISTS in_vendita BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prezzo_richiesto INTEGER;

COMMENT ON COLUMN public.tesseramenti.prezzo_richiesto IS
  'Cifra indicativa chiesta dal proprietario. NULL significa "fate un''offerta": non vincola le offerte.';

-- `tesseramenti` ha UNIQUE(giocatore_id) e viene aggiornata con ON CONFLICT DO
-- UPDATE da chiudi_asta, dallo spoglio delle buste e dall'import del listone.
-- Senza questo trigger, un giocatore che cambia proprietario per una qualunque
-- di quelle strade resterebbe in vetrina a nome di chi lo ha appena preso.
--
-- Un trigger e non un reset dentro ogni funzione: copre anche le strade che
-- verranno, e non richiede di rimettere le mani su chiudi_asta a ridosso del
-- collaudo.
CREATE OR REPLACE FUNCTION public.azzera_vetrina()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.squadra_id IS DISTINCT FROM OLD.squadra_id THEN
        NEW.in_vendita := false;
        NEW.prezzo_richiesto := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS azzera_vetrina_su_cambio ON public.tesseramenti;
CREATE TRIGGER azzera_vetrina_su_cambio
  BEFORE UPDATE ON public.tesseramenti
  FOR EACH ROW EXECUTE FUNCTION public.azzera_vetrina();


-- -----------------------------------------------------------------------------
-- 3. Le offerte
-- -----------------------------------------------------------------------------
-- L'enum e' CREATO, non esteso: non serve lo sdoppiamento in due migration che
-- ALTER TYPE ... ADD VALUE impone (vedi 20260806220000_origine_automatico.sql).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stato_offerta_trasf') THEN
        CREATE TYPE public.stato_offerta_trasf AS ENUM (
            'ATTESA',     -- in attesa della risposta del ricevente
            'ACCETTATA',  -- accettata, in attesa della ratifica dell'admin
            'RIFIUTATA',  -- il ricevente ha detto no
            'RITIRATA',   -- il proponente l'ha ritirata
            'RESPINTA',   -- l'admin non l'ha ratificata
            'DECADUTA',   -- un altro scambio ha portato via un giocatore coinvolto
            'ESEGUITA'
        );
    END IF;
END $$;

-- I cinque stati di chiusura non sono un lusso: senza, il manager legge
-- "non se n'e' fatto niente" senza sapere da chi sia dipeso.

CREATE TABLE IF NOT EXISTS public.offerte_trasferimento (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squadra_da   UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    squadra_a    UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    crediti      INTEGER NOT NULL DEFAULT 0 CHECK (crediti >= 0),
    stato        public.stato_offerta_trasf NOT NULL DEFAULT 'ATTESA',
    messaggio    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deciso_at    TIMESTAMPTZ,
    eseguito_at  TIMESTAMPTZ,
    CHECK (squadra_da <> squadra_a)
);

COMMENT ON TABLE public.offerte_trasferimento IS
  'Offerta di scambio: squadra_da propone a squadra_a per giocatore_id, dando crediti e/o i calciatori elencati nella tabella figlia.';
COMMENT ON COLUMN public.offerte_trasferimento.squadra_da IS 'Chi propone e riceve il giocatore richiesto.';
COMMENT ON COLUMN public.offerte_trasferimento.squadra_a  IS 'Chi possiede il giocatore richiesto.';

-- I calciatori CEDUTI dal proponente. Zero righe con crediti > 0 e' l'offerta
-- di soli soldi; righe con crediti = 0 e' lo scambio secco; entrambi e' il caso
-- misto. I tre tipi non sono tre strutture, ma tre configurazioni della stessa.
CREATE TABLE IF NOT EXISTS public.offerte_trasferimento_giocatori (
    offerta_id   UUID NOT NULL REFERENCES public.offerte_trasferimento(id) ON DELETE CASCADE,
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    PRIMARY KEY (offerta_id, giocatore_id)
);

-- Una sola trattativa viva per coppia (proponente, giocatore richiesto):
-- altrimenti si potrebbe inondare un manager di offerte sullo stesso giocatore.
CREATE UNIQUE INDEX IF NOT EXISTS offerte_trasf_una_viva
  ON public.offerte_trasferimento (squadra_da, giocatore_id)
  WHERE stato IN ('ATTESA', 'ACCETTATA');

CREATE INDEX IF NOT EXISTS offerte_trasf_per_ricevente
  ON public.offerte_trasferimento (squadra_a, stato);


-- -----------------------------------------------------------------------------
-- 4. RLS e permessi
-- -----------------------------------------------------------------------------
ALTER TABLE public.offerte_trasferimento            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerte_trasferimento_giocatori  ENABLE ROW LEVEL SECURITY;

-- Le trattative in corso sono affare dei due contraenti; l'admin le vede
-- perche' deve ratificarle. Gli scambi conclusi sono invece pubblici: la lega
-- ha diritto di sapere chi ha preso chi e a che prezzo.
DROP POLICY IF EXISTS "lettura_offerte_trasf" ON public.offerte_trasferimento;
CREATE POLICY "lettura_offerte_trasf" ON public.offerte_trasferimento FOR SELECT
USING (
    stato = 'ESEGUITA'
    OR squadra_da = public.mia_squadra_id()
    OR squadra_a  = public.mia_squadra_id()
    OR public.is_admin()
);

DROP POLICY IF EXISTS "lettura_offerte_trasf_giocatori" ON public.offerte_trasferimento_giocatori;
CREATE POLICY "lettura_offerte_trasf_giocatori" ON public.offerte_trasferimento_giocatori FOR SELECT
USING (
    EXISTS (
        -- Colonna qualificata di proposito: dentro la sottoquery il nome nudo
        -- si risolverebbe sulla tabella esterna solo perche' `o` non ce l'ha,
        -- e basterebbe aggiungere una colonna omonima per cambiarne il senso.
        SELECT 1 FROM public.offerte_trasferimento o
        WHERE o.id = offerte_trasferimento_giocatori.offerta_id
          AND (
              o.stato = 'ESEGUITA'
              OR o.squadra_da = public.mia_squadra_id()
              OR o.squadra_a  = public.mia_squadra_id()
              OR public.is_admin()
          )
    )
);

-- Nessuna policy di scrittura, di proposito: ogni modifica passa dalle RPC.

-- Senza questi GRANT ogni query risponde "permission denied for table": e' la
-- lezione gia' pagata in 20260801220100_consolidamento.sql.
GRANT SELECT ON public.offerte_trasferimento           TO authenticated;
GRANT SELECT ON public.offerte_trasferimento_giocatori TO authenticated;

-- Realtime: una nuova offerta deve comparire senza ricaricare la pagina. Il
-- volume e' irrisorio rispetto a quello di un'asta.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['offerte_trasferimento', 'offerte_trasferimento_giocatori', 'tesseramenti']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 5. La verifica di uno scambio
-- -----------------------------------------------------------------------------
-- Una funzione sola, chiamata alla creazione dell'offerta, all'accettazione e
-- di nuovo all'esecuzione. Restituisce NULL se lo scambio e' lecito, altrimenti
-- il motivo in italiano, pronto da mostrare.
--
-- Va rieseguita ogni volta e non solo all'inizio: fra la proposta e la ratifica
-- possono chiudersi altri scambi, cambiare i crediti, riempirsi le rose.
CREATE OR REPLACE FUNCTION public.verifica_scambio(
    p_squadra_da   UUID,
    p_squadra_a    UUID,
    p_giocatore_id INTEGER,
    p_crediti      INTEGER,
    p_offerti      INTEGER[]
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offerti      INTEGER[] := COALESCE(p_offerti, '{}'::INTEGER[]);
    v_n_offerti    INTEGER;
    v_slot_totali  INTEGER;
    v_max_p        INTEGER;
    v_aperto       BOOLEAN;
    v_cr_da        INTEGER;
    v_slot_da      INTEGER;
    v_slot_a       INTEGER;
    v_nome_a       TEXT;
    v_p_richiesto  INTEGER;
    v_p_offerti    INTEGER;
    v_p_att_da     INTEGER;
    v_p_att_a      INTEGER;
    v_p_new_da     INTEGER;
    v_p_new_a      INTEGER;
BEGIN
    v_n_offerti := COALESCE(array_length(v_offerti, 1), 0);

    SELECT COALESCE(fase_mercato_aperta, false), COALESCE(slot_totali, 30), COALESCE(slot_p, 3)
    INTO v_aperto, v_slot_totali, v_max_p
    FROM public.regole_lega LIMIT 1;

    IF NOT COALESCE(v_aperto, false) THEN
        RETURN 'Il mercato trasferimenti e'' chiuso.';
    END IF;

    -- Assertone: il mercato precede le aste e non dovrebbe mai sovrapporsi.
    -- Se succede e' un'apertura sbagliata delle fasi, e va detto in chiaro.
    IF EXISTS (SELECT 1 FROM public.aste WHERE stato IN ('IN_CORSO', 'CHIAMATA')) THEN
        RETURN 'C''e'' un''asta aperta: gli scambi restano sospesi finche'' non si chiude.';
    END IF;

    IF p_crediti IS NULL OR p_crediti < 0 THEN
        RETURN 'I crediti offerti non possono essere negativi.';
    END IF;

    IF p_crediti = 0 AND v_n_offerti = 0 THEN
        RETURN 'Un''offerta deve contenere crediti, calciatori, o entrambi.';
    END IF;

    IF p_giocatore_id = ANY(v_offerti) THEN
        RETURN 'Non puoi offrire il giocatore che stai chiedendo.';
    END IF;

    -- Proprieta', da rileggere ogni volta: fra la proposta e la ratifica piu'
    -- di una cosa puo' essere cambiata.
    IF NOT EXISTS (
        SELECT 1 FROM public.tesseramenti
        WHERE giocatore_id = p_giocatore_id AND squadra_id = p_squadra_a
    ) THEN
        RETURN 'Il giocatore richiesto non appartiene piu'' a quella squadra.';
    END IF;

    IF v_n_offerti > 0 AND (
        SELECT count(*) FROM public.tesseramenti
        WHERE giocatore_id = ANY(v_offerti) AND squadra_id = p_squadra_da
    ) <> v_n_offerti THEN
        RETURN 'Uno dei calciatori offerti non fa piu'' parte della tua rosa.';
    END IF;

    SELECT crediti_residui, slot_occupati INTO v_cr_da, v_slot_da
    FROM public.squadre WHERE id = p_squadra_da;

    SELECT slot_occupati, nome INTO v_slot_a, v_nome_a
    FROM public.squadre WHERE id = p_squadra_a;

    IF v_cr_da IS NULL OR v_slot_a IS NULL THEN
        RETURN 'Una delle due squadre non esiste piu''.';
    END IF;

    IF v_cr_da - p_crediti < 0 THEN
        RETURN format('Crediti insufficienti: ne hai %s e ne stai offrendo %s.', v_cr_da, p_crediti);
    END IF;

    -- Capienza. Chi propone cede v_n_offerti giocatori e ne riceve uno.
    IF v_slot_da - v_n_offerti + 1 > v_slot_totali THEN
        RETURN format('La tua rosa supererebbe i %s giocatori.', v_slot_totali);
    END IF;

    IF v_slot_a + v_n_offerti - 1 > v_slot_totali THEN
        RETURN format('La rosa di %s supererebbe i %s giocatori.', v_nome_a, v_slot_totali);
    END IF;

    -- Portieri. Si ragiona sul SALDO, non sul conteggio attuale: cedere un
    -- portiere e prenderne un altro deve restare lecito anche a reparto pieno.
    SELECT count(*) INTO v_p_richiesto
    FROM public.giocatori WHERE id = p_giocatore_id AND ruolo = 'P';

    SELECT count(*) INTO v_p_offerti
    FROM public.giocatori WHERE id = ANY(v_offerti) AND ruolo = 'P';

    SELECT count(*) INTO v_p_att_da
    FROM public.tesseramenti t JOIN public.giocatori g ON g.id = t.giocatore_id
    WHERE t.squadra_id = p_squadra_da AND g.ruolo = 'P';

    SELECT count(*) INTO v_p_att_a
    FROM public.tesseramenti t JOIN public.giocatori g ON g.id = t.giocatore_id
    WHERE t.squadra_id = p_squadra_a AND g.ruolo = 'P';

    v_p_new_da := v_p_att_da - v_p_offerti + v_p_richiesto;
    v_p_new_a  := v_p_att_a  - v_p_richiesto + v_p_offerti;

    -- La soglia blocca la salita, non chi e' gia' oltre: stessa regola scelta
    -- in 20260806210000_limite_portieri.sql.
    IF v_p_new_da > v_max_p AND v_p_new_da > v_p_att_da THEN
        RETURN format('Con questo scambio avresti %s portieri: il massimo e'' %s.', v_p_new_da, v_max_p);
    END IF;

    IF v_p_new_a > v_max_p AND v_p_new_a > v_p_att_a THEN
        RETURN format('%s si ritroverebbe con %s portieri: il massimo e'' %s.', v_nome_a, v_p_new_a, v_max_p);
    END IF;

    RETURN NULL;
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. La vetrina, lato manager
-- -----------------------------------------------------------------------------
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
-- 7. Creare, ritirare, rispondere
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crea_offerta_trasferimento(
    p_giocatore_id      INTEGER,
    p_crediti           INTEGER DEFAULT 0,
    p_giocatori_offerti INTEGER[] DEFAULT '{}',
    p_messaggio         TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mia        UUID;
    v_prop       UUID;
    v_offerti    INTEGER[] := COALESCE(p_giocatori_offerti, '{}'::INTEGER[]);
    v_distinti   INTEGER[];
    v_crediti    INTEGER   := COALESCE(p_crediti, 0);
    v_errore     TEXT;
    v_offerta_id UUID;
BEGIN
    v_mia := public.mia_squadra_id();
    IF v_mia IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al tuo profilo.';
    END IF;

    -- Duplicati nell'array: la chiave primaria della tabella figlia li
    -- rifiuterebbe con un messaggio incomprensibile.
    SELECT COALESCE(array_agg(DISTINCT x), '{}'::INTEGER[])
    INTO v_distinti
    FROM unnest(v_offerti) AS x;
    v_offerti := v_distinti;

    SELECT squadra_id INTO v_prop FROM public.tesseramenti WHERE giocatore_id = p_giocatore_id;
    IF v_prop IS NULL THEN
        RAISE EXCEPTION 'Questo giocatore non e'' tesserato per nessuna squadra.';
    END IF;
    IF v_prop = v_mia THEN
        RAISE EXCEPTION 'Il giocatore e'' gia'' tuo.';
    END IF;

    -- Prima il duplicato: l'indice parziale lo rifiuterebbe comunque, ma con
    -- un errore di Postgres al posto di una frase leggibile.
    IF EXISTS (
        SELECT 1 FROM public.offerte_trasferimento
        WHERE squadra_da = v_mia AND giocatore_id = p_giocatore_id
          AND stato IN ('ATTESA', 'ACCETTATA')
    ) THEN
        RAISE EXCEPTION 'Hai gia'' un''offerta aperta per questo giocatore.';
    END IF;

    v_errore := public.verifica_scambio(v_mia, v_prop, p_giocatore_id, v_crediti, v_offerti);
    IF v_errore IS NOT NULL THEN
        RAISE EXCEPTION '%', v_errore;
    END IF;

    INSERT INTO public.offerte_trasferimento (squadra_da, squadra_a, giocatore_id, crediti, messaggio)
    VALUES (v_mia, v_prop, p_giocatore_id, v_crediti, NULLIF(btrim(COALESCE(p_messaggio, '')), ''))
    RETURNING id INTO v_offerta_id;

    INSERT INTO public.offerte_trasferimento_giocatori (offerta_id, giocatore_id)
    SELECT v_offerta_id, x FROM unnest(v_offerti) AS x;

    RETURN json_build_object('success', true, 'offerta_id', v_offerta_id);
END;
$$;


CREATE OR REPLACE FUNCTION public.ritira_offerta_trasferimento(p_offerta_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mia UUID;
    v_off RECORD;
BEGIN
    v_mia := public.mia_squadra_id();
    SELECT * INTO v_off FROM public.offerte_trasferimento WHERE id = p_offerta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offerta non trovata.'; END IF;

    -- IS DISTINCT FROM e non <>: con un profilo senza squadra v_mia e' NULL,
    -- il confronto varrebbe NULL, l'IF non scatterebbe e il controllo di
    -- proprieta' salterebbe del tutto.
    IF v_off.squadra_da IS DISTINCT FROM v_mia AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Non e'' la tua offerta.';
    END IF;

    -- Solo finche' e' in attesa: una volta accettata la palla passa all'admin,
    -- e chi ha accettato non deve vedersela sfilare da sotto.
    IF v_off.stato <> 'ATTESA' THEN
        RAISE EXCEPTION 'Questa offerta non e'' piu'' ritirabile.';
    END IF;

    UPDATE public.offerte_trasferimento
    SET stato = 'RITIRATA', deciso_at = now()
    WHERE id = p_offerta_id;

    RETURN json_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.rispondi_offerta_trasferimento(
    p_offerta_id UUID,
    p_accetta    BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mia     UUID;
    v_off     RECORD;
    v_offerti INTEGER[];
    v_errore  TEXT;
BEGIN
    v_mia := public.mia_squadra_id();
    SELECT * INTO v_off FROM public.offerte_trasferimento WHERE id = p_offerta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offerta non trovata.'; END IF;

    -- Vedi la nota in ritira_offerta_trasferimento: con v_mia NULL un <> qui
    -- lascerebbe rispondere a offerte altrui.
    IF v_off.squadra_a IS DISTINCT FROM v_mia THEN
        RAISE EXCEPTION 'Questa offerta non e'' rivolta a te.';
    END IF;

    IF v_off.stato <> 'ATTESA' THEN
        RAISE EXCEPTION 'Questa offerta e'' gia'' stata decisa.';
    END IF;

    IF NOT COALESCE(p_accetta, false) THEN
        UPDATE public.offerte_trasferimento
        SET stato = 'RIFIUTATA', deciso_at = now()
        WHERE id = p_offerta_id;
        RETURN json_build_object('success', true, 'stato', 'RIFIUTATA');
    END IF;

    SELECT COALESCE(array_agg(giocatore_id), '{}'::INTEGER[]) INTO v_offerti
    FROM public.offerte_trasferimento_giocatori WHERE offerta_id = p_offerta_id;

    -- Meglio scoprire adesso che lo scambio non regge, che farlo scoprire
    -- all'admin al momento della ratifica.
    v_errore := public.verifica_scambio(v_off.squadra_da, v_off.squadra_a, v_off.giocatore_id, v_off.crediti, v_offerti);
    IF v_errore IS NOT NULL THEN
        RAISE EXCEPTION '%', v_errore;
    END IF;

    UPDATE public.offerte_trasferimento
    SET stato = 'ACCETTATA', deciso_at = now()
    WHERE id = p_offerta_id;

    RETURN json_build_object('success', true, 'stato', 'ACCETTATA');
END;
$$;


-- -----------------------------------------------------------------------------
-- 8. L'esecuzione, in mano all'admin
-- -----------------------------------------------------------------------------
-- Il prezzo di un giocatore che cambia squadra e' il valore della contropartita
-- che lo ha comprato:
--
--   * chi propone riceve UN giocatore, che gli costa
--     crediti + somma delle quotazioni dei calciatori ceduti;
--   * chi accetta puo' riceverne piu' d'uno, e allora la quotazione del
--     giocatore richiesto si ripartisce fra loro in proporzione alla propria
--     quotazione, con i resti assegnati per parte decimale decrescente cosi'
--     che la somma torni esatta.
--
-- Con un solo calciatore ceduto la seconda regola degenera nella prima.
-- `prezzo_pagato` resta un dato descrittivo: nessun calcolo di budget lo legge.
CREATE OR REPLACE FUNCTION public.esegui_trasferimento(
    p_offerta_id UUID,
    p_approva    BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_off        RECORD;
    v_offerti    INTEGER[];
    v_n_offerti  INTEGER;
    v_errore     TEXT;
    v_valore_ric INTEGER;   -- quanto costa al proponente il giocatore ricevuto
    v_quota_ric  INTEGER;   -- quotazione del giocatore richiesto, da ripartire
    v_coinvolti  INTEGER[];
    v_decadute   INTEGER;
    v_id         UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo un admin puo'' eseguire uno scambio.';
    END IF;

    SELECT * INTO v_off FROM public.offerte_trasferimento WHERE id = p_offerta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offerta non trovata.'; END IF;

    IF v_off.stato <> 'ACCETTATA' THEN
        RAISE EXCEPTION 'Si possono ratificare solo le offerte accettate dal ricevente.';
    END IF;

    IF NOT COALESCE(p_approva, true) THEN
        UPDATE public.offerte_trasferimento
        SET stato = 'RESPINTA', deciso_at = now()
        WHERE id = p_offerta_id;
        RETURN json_build_object('success', true, 'stato', 'RESPINTA');
    END IF;

    -- Le due squadre si bloccano SEMPRE in ordine di id: due ratifiche
    -- incrociate simultanee, prese in ordine opposto, si aspetterebbero a
    -- vicenda per sempre.
    FOR v_id IN
        SELECT id FROM public.squadre
        WHERE id IN (v_off.squadra_da, v_off.squadra_a)
        ORDER BY id
    LOOP
        PERFORM 1 FROM public.squadre WHERE id = v_id FOR UPDATE;
    END LOOP;

    SELECT COALESCE(array_agg(giocatore_id), '{}'::INTEGER[]) INTO v_offerti
    FROM public.offerte_trasferimento_giocatori WHERE offerta_id = p_offerta_id;
    v_n_offerti := COALESCE(array_length(v_offerti, 1), 0);

    v_errore := public.verifica_scambio(v_off.squadra_da, v_off.squadra_a, v_off.giocatore_id, v_off.crediti, v_offerti);
    IF v_errore IS NOT NULL THEN
        RAISE EXCEPTION '%', v_errore;
    END IF;

    SELECT quotazione INTO v_quota_ric FROM public.giocatori WHERE id = v_off.giocatore_id;

    SELECT v_off.crediti + COALESCE(SUM(quotazione), 0) INTO v_valore_ric
    FROM public.giocatori WHERE id = ANY(v_offerti);

    -- Il giocatore richiesto passa a chi ha proposto.
    UPDATE public.tesseramenti
    SET squadra_id = v_off.squadra_da, prezzo_pagato = v_valore_ric
    WHERE giocatore_id = v_off.giocatore_id;

    -- I calciatori ceduti passano a chi ha accettato, spartendosi la
    -- quotazione del richiesto.
    IF v_n_offerti > 0 THEN
        WITH ceduti AS (
            SELECT g.id, g.quotazione::NUMERIC AS q
            FROM public.giocatori g WHERE g.id = ANY(v_offerti)
        ),
        totale AS (
            SELECT GREATEST(SUM(q), 1) AS q FROM ceduti
        ),
        base AS (
            SELECT c.id,
                   FLOOR(v_quota_ric * c.q / t.q)::INTEGER AS quota,
                   (v_quota_ric * c.q / t.q) - FLOOR(v_quota_ric * c.q / t.q) AS resto
            FROM ceduti c CROSS JOIN totale t
        ),
        avanzo AS (
            SELECT v_quota_ric - COALESCE(SUM(quota), 0) AS r FROM base
        ),
        riparto AS (
            SELECT b.id,
                   b.quota + CASE
                       WHEN ROW_NUMBER() OVER (ORDER BY b.resto DESC, b.id ASC) <= (SELECT r FROM avanzo)
                       THEN 1 ELSE 0
                   END AS prezzo
            FROM base b
        )
        UPDATE public.tesseramenti t
        SET squadra_id = v_off.squadra_a, prezzo_pagato = r.prezzo
        FROM riparto r
        WHERE t.giocatore_id = r.id;
    END IF;

    -- in_vendita e prezzo_richiesto li azzera il trigger azzera_vetrina().

    UPDATE public.squadre
    SET crediti_residui = crediti_residui - v_off.crediti,
        slot_occupati   = slot_occupati - v_n_offerti + 1
    WHERE id = v_off.squadra_da;

    UPDATE public.squadre
    SET crediti_residui = crediti_residui + v_off.crediti,
        slot_occupati   = slot_occupati + v_n_offerti - 1
    WHERE id = v_off.squadra_a;

    UPDATE public.offerte_trasferimento
    SET stato = 'ESEGUITA', eseguito_at = now()
    WHERE id = p_offerta_id;

    -- Decadenza a cascata. E' il passo che si dimentica: senza, restano in giro
    -- offerte pendenti su giocatori che hanno appena cambiato proprietario.
    v_coinvolti := v_offerti || v_off.giocatore_id;

    WITH decadute AS (
        UPDATE public.offerte_trasferimento o
        SET stato = 'DECADUTA', deciso_at = now()
        WHERE o.id <> p_offerta_id
          AND o.stato IN ('ATTESA', 'ACCETTATA')
          AND (
              o.giocatore_id = ANY(v_coinvolti)
              OR EXISTS (
                  SELECT 1 FROM public.offerte_trasferimento_giocatori og
                  WHERE og.offerta_id = o.id AND og.giocatore_id = ANY(v_coinvolti)
              )
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_decadute FROM decadute;

    RETURN json_build_object(
        'success', true,
        'stato', 'ESEGUITA',
        'prezzo_richiesto', v_valore_ric,
        'offerte_decadute', v_decadute
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 9. Interruttore del mercato
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_mercato(p_stato BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo un admin puo'' aprire o chiudere il mercato.';
    END IF;

    UPDATE public.regole_lega SET fase_mercato_aperta = COALESCE(p_stato, false) WHERE id IS NOT NULL;

    RETURN json_build_object('success', true, 'aperta', COALESCE(p_stato, false));
END;
$$;


GRANT EXECUTE ON FUNCTION public.verifica_scambio(UUID, UUID, INTEGER, INTEGER, INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imposta_vetrina(INTEGER, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crea_offerta_trasferimento(INTEGER, INTEGER, INTEGER[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ritira_offerta_trasferimento(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rispondi_offerta_trasferimento(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esegui_trasferimento(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_mercato(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
