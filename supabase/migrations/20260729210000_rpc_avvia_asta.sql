-- Funzione sicura per avviare un'asta aggirando RLS
CREATE OR REPLACE FUNCTION public.avvia_asta_admin(p_giocatore_id INTEGER)
RETURNS JSON AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    -- Verifica permessi
    SELECT public.is_admin() INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Solo un ADMIN può avviare un''asta.';
    END IF;

    -- Inserisce l'asta
    INSERT INTO public.aste (
      giocatore_id, 
      stato, 
      base_asta, 
      prezzo_corrente, 
      scadenza_corrente
    ) VALUES (
      p_giocatore_id,
      'IN_CORSO',
      1,
      0,
      now() + '15 seconds'::interval
    );

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
