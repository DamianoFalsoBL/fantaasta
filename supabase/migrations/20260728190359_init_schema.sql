-- Schema Iniziale: Fantacalcio Aste

-- 1. Tipi ENUM
CREATE TYPE public.ruolo_utente AS ENUM ('ADMIN', 'MANAGER');
CREATE TYPE public.ruolo_giocatore AS ENUM ('P', 'D', 'C', 'A');
CREATE TYPE public.stato_giocatore AS ENUM ('LIBERO', 'TESSERATO', 'IN_ASTA');
CREATE TYPE public.stato_asta AS ENUM ('PROGRAMMATA', 'IN_CORSO', 'CHIUSA', 'ANNULLATA');
CREATE TYPE public.origine_offerta AS ENUM ('MANAGER', 'ADMIN_PER_CONTO');
CREATE TYPE public.esito_busta AS ENUM ('ATTESA', 'VINTO', 'CONTESO');

-- 2. Tabelle
CREATE TABLE public.squadre (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    budget_iniziale INTEGER NOT NULL DEFAULT 500,
    crediti_residui INTEGER NOT NULL DEFAULT 500,
    slot_occupati INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profili (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    ruolo public.ruolo_utente NOT NULL DEFAULT 'MANAGER',
    squadra_id UUID REFERENCES public.squadre(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.regole_lega (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_p INTEGER NOT NULL DEFAULT 3,
    slot_d INTEGER NOT NULL DEFAULT 8,
    slot_c INTEGER NOT NULL DEFAULT 8,
    slot_a INTEGER NOT NULL DEFAULT 6,
    budget_standard INTEGER NOT NULL DEFAULT 500,
    rilancio_minimo INTEGER NOT NULL DEFAULT 1,
    durata_timer INTEGER NOT NULL DEFAULT 60,
    costo_minimo_giocatore INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE public.giocatori (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    ruolo public.ruolo_giocatore NOT NULL,
    squadra_serie_a TEXT NOT NULL,
    quotazione INTEGER NOT NULL DEFAULT 1,
    stato public.stato_giocatore NOT NULL DEFAULT 'LIBERO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tesseramenti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squadra_id UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    prezzo_pagato INTEGER NOT NULL,
    stagione TEXT NOT NULL DEFAULT '2024-2025',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(giocatore_id)
);

CREATE TABLE public.liste_aste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    squadra_id UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    UNIQUE(giocatore_id, squadra_id)
);

CREATE TABLE public.aste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    stato public.stato_asta NOT NULL DEFAULT 'PROGRAMMATA',
    base_asta INTEGER NOT NULL DEFAULT 1,
    scadenza_corrente TIMESTAMPTZ,
    squadra_in_testa UUID REFERENCES public.squadre(id) ON DELETE SET NULL,
    prezzo_corrente INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(giocatore_id)
);

CREATE TABLE public.offerte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asta_id UUID NOT NULL REFERENCES public.aste(id) ON DELETE CASCADE,
    squadra_id UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    importo INTEGER NOT NULL,
    origine public.origine_offerta NOT NULL DEFAULT 'MANAGER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.buste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squadra_id UUID NOT NULL REFERENCES public.squadre(id) ON DELETE CASCADE,
    giocatore_id INTEGER NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    esito public.esito_busta NOT NULL DEFAULT 'ATTESA',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(squadra_id, giocatore_id)
);

-- 3. Funzioni
CREATE OR REPLACE FUNCTION public.calcola_massimo_offribile(p_squadra_id UUID, p_giocatore_in_asta_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_budget_residuo INTEGER;
    v_promesse_count INTEGER;
    v_promesse_costo INTEGER;
    v_slot_occupati INTEGER;
    v_slot_totali INTEGER;
    v_slot_liberi INTEGER;
    v_costo_minimo INTEGER;
    v_costo_mantenimento INTEGER;
    v_slot_scoperti INTEGER;
BEGIN
    SELECT crediti_residui, slot_occupati INTO v_budget_residuo, v_slot_occupati
    FROM public.squadre WHERE id = p_squadra_id;

    SELECT (slot_p + slot_d + slot_c + slot_a), costo_minimo_giocatore
    INTO v_slot_totali, v_costo_minimo
    FROM public.regole_lega LIMIT 1;

    v_slot_liberi := v_slot_totali - v_slot_occupati;

    -- Calcola costo base dei giocatori ancora in lista aste, escluso quello attualmente in asta
    SELECT COUNT(*), COALESCE(SUM(g.quotazione), 0) INTO v_promesse_count, v_promesse_costo
    FROM public.liste_aste la
    JOIN public.giocatori g ON la.giocatore_id = g.id
    WHERE la.squadra_id = p_squadra_id 
      AND g.stato != 'TESSERATO'
      AND g.id != p_giocatore_in_asta_id;
    
    v_slot_scoperti := v_slot_liberi - 1 - v_promesse_count; -- -1 è lo slot per il giocatore in asta
    IF v_slot_scoperti < 0 THEN v_slot_scoperti := 0; END IF;
    
    v_costo_mantenimento := v_promesse_costo + (v_slot_scoperti * v_costo_minimo);
    
    RETURN v_budget_residuo - v_costo_mantenimento;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger creazione profili
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profili (id, ruolo)
  VALUES (new.id, 'MANAGER');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. RLS
ALTER TABLE public.squadre ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profili ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regole_lega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giocatori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tesseramenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liste_aste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aste ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buste ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lettura libera" ON public.squadre FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.profili FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.regole_lega FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.giocatori FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.tesseramenti FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.liste_aste FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.aste FOR SELECT USING (true);
CREATE POLICY "Lettura libera" ON public.offerte FOR SELECT USING (true);
CREATE POLICY "Lettura limitata buste" ON public.buste FOR SELECT USING (
    squadra_id IN (SELECT squadra_id FROM public.profili WHERE id = auth.uid()) OR 
    EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN')
);

-- Admin può scrivere tutto, ma i manager niente (per ora, finché non ci saranno le RPC delle offerte)
CREATE POLICY "Admin write_squadre" ON public.squadre FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_profili" ON public.profili FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_regole_lega" ON public.regole_lega FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_giocatori" ON public.giocatori FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_tesseramenti" ON public.tesseramenti FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_liste_aste" ON public.liste_aste FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_aste" ON public.aste FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));
CREATE POLICY "Admin write_buste" ON public.buste FOR ALL USING (EXISTS (SELECT 1 FROM public.profili WHERE id = auth.uid() AND ruolo = 'ADMIN'));

-- L'admin default (il primo che si registra) lo possiamo inserire manualmente o con script
