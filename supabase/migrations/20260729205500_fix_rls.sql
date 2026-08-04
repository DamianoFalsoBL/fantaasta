-- Fix per infinite recursion nelle RLS

-- Creiamo una funzione con SECURITY DEFINER che aggira le policy
-- per controllare se l'utente è ADMIN, senza innescare un loop infinito.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profili 
    WHERE id = auth.uid() AND ruolo = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aggiorniamo le policy per usare questa nuova funzione sicura
DROP POLICY IF EXISTS "Admin write_squadre" ON public.squadre;
CREATE POLICY "Admin write_squadre" ON public.squadre FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_profili" ON public.profili;
CREATE POLICY "Admin write_profili" ON public.profili FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_regole_lega" ON public.regole_lega;
CREATE POLICY "Admin write_regole_lega" ON public.regole_lega FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_giocatori" ON public.giocatori;
CREATE POLICY "Admin write_giocatori" ON public.giocatori FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_tesseramenti" ON public.tesseramenti;
CREATE POLICY "Admin write_tesseramenti" ON public.tesseramenti FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_liste_aste" ON public.liste_aste;
CREATE POLICY "Admin write_liste_aste" ON public.liste_aste FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_aste" ON public.aste;
CREATE POLICY "Admin write_aste" ON public.aste FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin write_buste" ON public.buste;
CREATE POLICY "Admin write_buste" ON public.buste FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Lettura limitata buste" ON public.buste;
CREATE POLICY "Lettura limitata buste" ON public.buste FOR SELECT USING (
    squadra_id IN (SELECT squadra_id FROM public.profili WHERE id = auth.uid()) OR 
    public.is_admin()
);
