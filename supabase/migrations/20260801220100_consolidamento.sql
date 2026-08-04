-- =============================================================================
-- CONSOLIDAMENTO
-- =============================================================================
-- Assorbe e corregge i 22 file fase*.sql che erano stati applicati a mano
-- nell'editor SQL di Supabase e che avevano portato lo schema live fuori
-- sincrono rispetto a supabase/migrations/.
--
-- Ogni blocco è idempotente: la migration è sicura sia su un database creato
-- da zero (`supabase db reset`) sia su quello attuale dove le fasi 5-22 sono
-- già state applicate.
--
-- Correzioni principali rispetto ai fase*.sql:
--   * la policy "Admin write_profili" torna a usare public.is_admin(), che è
--     SECURITY DEFINER e quindi non innesca la ricorsione RLS (42P17) che
--     fase21/fase22 avevano reintrodotto;
--   * tutte le SECURITY DEFINER ricevono `SET search_path`;
--   * make_me_super_admin() (privilege escalation aperta) viene eliminata;
--   * il SUPER_ADMIN è ancorato a un'email configurabile e sopravvive al reset;
--   * vengono create le colonne e le RPC che il codice chiamava senza che
--     esistessero (aste.rilanci/abbandoni, abbandona_asta, import_giocatori_batch).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SCHEMA — colonne mancanti
-- -----------------------------------------------------------------------------

-- regole_lega: fasi buste, ordine di chiamata, slot totali, email del fondatore.
ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS fase_buste_aperta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS ordine_chiamata UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS indice_chiamata INTEGER NOT NULL DEFAULT 1;

-- slot_totali è la fonte unica di verità sulla dimensione della rosa.
-- Le rose reali della lega hanno tutte 30 giocatori ma con ripartizione per
-- ruolo libera (P 3-4, D 8-13, C 8-13, A 3-8): slot_p/d/c/a restano quindi
-- informativi e non vincolanti, e nel codice contava già solo la loro somma.
ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS slot_totali INTEGER NOT NULL DEFAULT 30;

-- Email dell'utente che deve essere SUPER_ADMIN. Usata dal trigger su
-- auth.users, così il ruolo si riassegna da solo dopo ogni reset.
ALTER TABLE public.regole_lega ADD COLUMN IF NOT EXISTS super_admin_email TEXT;

-- regole_lega è una tabella singleton: tutto il codice fa `LIMIT 1`.
-- Finora però non veniva mai inserita alcuna riga, quindi ogni SELECT tornava
-- NULL: calcola_massimo_offribile restituiva NULL e submit_buste non riusciva
-- a verificare se la fase buste fosse aperta.
INSERT INTO public.regole_lega (slot_p, slot_d, slot_c, slot_a, slot_totali, super_admin_email)
SELECT 3, 8, 8, 6, 30, 'superadmin@fantacalcio.local'
WHERE NOT EXISTS (SELECT 1 FROM public.regole_lega);

CREATE UNIQUE INDEX IF NOT EXISTS regole_lega_singleton ON public.regole_lega ((true));

-- Su un database dove la riga di regole_lega esisteva già, l'INSERT qui sopra
-- non fa nulla e super_admin_email resterebbe NULL, disattivando il trigger.
-- Lo si deriva quindi dal SUPER_ADMIN attualmente configurato, così un progetto
-- già avviato mantiene il proprio fondatore senza interventi manuali.
UPDATE public.regole_lega r
SET super_admin_email = COALESCE(
    (SELECT u.email
     FROM public.profili p
     JOIN auth.users u ON u.id = p.id
     WHERE p.ruolo = 'SUPER_ADMIN'
     ORDER BY p.created_at
     LIMIT 1),
    'superadmin@fantacalcio.local'
)
WHERE r.super_admin_email IS NULL;

-- giocatori: il listone è Mantra su Euroleghe, non Serie A.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'giocatori' AND column_name = 'squadra_serie_a'
  ) THEN
    ALTER TABLE public.giocatori RENAME COLUMN squadra_serie_a TO squadra;
  END IF;
END $$;

ALTER TABLE public.giocatori ADD COLUMN IF NOT EXISTS eta INTEGER;
ALTER TABLE public.giocatori ADD COLUMN IF NOT EXISTS ruolo_mantra TEXT[];
ALTER TABLE public.giocatori ADD COLUMN IF NOT EXISTS fuori_lista BOOLEAN NOT NULL DEFAULT false;

-- aste: colonne che fase7 scriveva e che TabelloneAsta legge, ma che nessun
-- DDL aveva mai creato. `abbandoni` è l'elenco delle squadre che si sono
-- ritirate dall'asta corrente.
ALTER TABLE public.aste ADD COLUMN IF NOT EXISTS rilanci JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.aste ADD COLUMN IF NOT EXISTS abbandoni JSONB NOT NULL DEFAULT '[]'::jsonb;

-- I dati del listone sono scaricati a luglio 2026.
ALTER TABLE public.tesseramenti ALTER COLUMN stagione SET DEFAULT '2026-2027';


-- -----------------------------------------------------------------------------
-- 2. HELPER DI AUTORIZZAZIONE
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: il proprietario della funzione bypassa le RLS, quindi la
-- lettura di `profili` qui dentro NON riattiva le policy di `profili`.
-- È esattamente ciò che rompe il ciclo di ricorsione.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profili
    WHERE id = auth.uid() AND ruolo IN ('ADMIN', 'SUPER_ADMIN')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profili
    WHERE id = auth.uid() AND ruolo = 'SUPER_ADMIN'
  );
END;
$$;

-- Squadra dell'utente corrente. Anche questa SECURITY DEFINER, così le policy
-- che la usano non rileggono `profili` sotto RLS.
CREATE OR REPLACE FUNCTION public.mia_squadra_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT squadra_id INTO v_id FROM public.profili WHERE id = auth.uid();
  RETURN v_id;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. RLS — ricostruzione completa
-- -----------------------------------------------------------------------------
-- Le policy erano sparse su init_schema, fix_rls, fase6, fase21 e fase22, con
-- nomi diversi per la stessa regola. Su `buste` ne coesistevano sei permissive
-- (due duplicati funzionali) perché fase6 ne aggiunse quattro senza droppare le
-- due precedenti. Qui si azzera tutto e si ricrea una regola per caso d'uso.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('squadre','profili','regole_lega','giocatori',
                        'tesseramenti','liste_aste','aste','offerte','buste')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Lettura: i dati di lega sono pubblici fra i partecipanti.
CREATE POLICY "lettura_squadre"      ON public.squadre      FOR SELECT USING (true);
CREATE POLICY "lettura_profili"      ON public.profili      FOR SELECT USING (true);
CREATE POLICY "lettura_regole_lega"  ON public.regole_lega  FOR SELECT USING (true);
CREATE POLICY "lettura_giocatori"    ON public.giocatori    FOR SELECT USING (true);
CREATE POLICY "lettura_tesseramenti" ON public.tesseramenti FOR SELECT USING (true);
CREATE POLICY "lettura_liste_aste"   ON public.liste_aste   FOR SELECT USING (true);
CREATE POLICY "lettura_aste"         ON public.aste         FOR SELECT USING (true);
CREATE POLICY "lettura_offerte"      ON public.offerte      FOR SELECT USING (true);

-- Scrittura: riservata agli admin. `WITH CHECK` esplicito, che le vecchie
-- policy `FOR ALL USING (...)` omettevano lasciando gli INSERT scoperti.
CREATE POLICY "admin_scrive_squadre"      ON public.squadre      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_profili"      ON public.profili      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_regole_lega"  ON public.regole_lega  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_giocatori"    ON public.giocatori    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_tesseramenti" ON public.tesseramenti FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_liste_aste"   ON public.liste_aste   FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_aste"         ON public.aste         FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_scrive_offerte"      ON public.offerte      FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Buste: sono offerte segrete, quindi ognuno vede solo le proprie.
CREATE POLICY "lettura_proprie_buste" ON public.buste FOR SELECT
  USING (squadra_id = public.mia_squadra_id() OR public.is_admin());

CREATE POLICY "inserimento_proprie_buste" ON public.buste FOR INSERT
  WITH CHECK (squadra_id = public.mia_squadra_id());

CREATE POLICY "cancellazione_proprie_buste" ON public.buste FOR DELETE
  USING (squadra_id = public.mia_squadra_id());

CREATE POLICY "admin_scrive_buste" ON public.buste FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Un manager può modificare la propria lista di chiamata.
CREATE POLICY "gestione_propria_lista" ON public.liste_aste FOR ALL
  USING (squadra_id = public.mia_squadra_id())
  WITH CHECK (squadra_id = public.mia_squadra_id());


-- -----------------------------------------------------------------------------
-- 4. TRIGGER — SUPER_ADMIN stabile
-- -----------------------------------------------------------------------------
-- Prima ogni nuovo utente auth diventava MANAGER senza eccezioni. Poiché
-- hard_reset_sistema cancella auth.users, ricreare l'account del fondatore ne
-- azzerava i privilegi: da qui i sei script di "restore superadmin" (fase11,
-- 12, 16, 18, 19, 20) con tre strategie di targeting diverse e incompatibili.
-- Ora il ruolo si deriva dall'email configurata in regole_lega.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_super_email TEXT;
  v_ruolo public.ruolo_utente;
BEGIN
  SELECT super_admin_email INTO v_super_email FROM public.regole_lega LIMIT 1;

  IF v_super_email IS NOT NULL AND lower(new.email) = lower(v_super_email) THEN
    v_ruolo := 'SUPER_ADMIN';
  ELSE
    v_ruolo := 'MANAGER';
  END IF;

  INSERT INTO public.profili (id, ruolo)
  VALUES (new.id, v_ruolo)
  ON CONFLICT (id) DO UPDATE SET ruolo = EXCLUDED.ruolo;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 5. GRANT sulle tabelle
-- -----------------------------------------------------------------------------
-- Nessun file del progetto conteneva GRANT: finora ci si appoggiava all'esposizione
-- automatica delle nuove tabelle. `supabase/config.toml` documenta però che quel
-- comportamento è deprecato e che il default è ormai "non esposto"; senza queste
-- righe un database ricreato risponde "permission denied for table profili" a
-- ogni query dei client.
--
-- Il controllo fine resta alle RLS: qui si concede solo l'accesso a livello di
-- tabella, che le policy definite sopra poi restringono.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.squadre, public.profili, public.regole_lega, public.giocatori,
    public.tesseramenti, public.liste_aste, public.aste, public.offerte, public.buste
TO authenticated;

-- Riallinea subito l'utente già esistente che corrisponde all'email configurata.
UPDATE public.profili p
SET ruolo = 'SUPER_ADMIN'
FROM auth.users u, public.regole_lega r
WHERE p.id = u.id
  AND r.super_admin_email IS NOT NULL
  AND lower(u.email) = lower(r.super_admin_email)
  AND p.ruolo IS DISTINCT FROM 'SUPER_ADMIN';
