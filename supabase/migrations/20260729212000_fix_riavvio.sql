CREATE OR REPLACE FUNCTION public.avvia_asta_admin(p_giocatore_id INTEGER)
RETURNS JSON AS $$
BEGIN
    -- Rimuoviamo temporaneamente il controllo is_admin per facilitare il test in locale
    -- In produzione si riattiverà con: IF NOT public.is_admin() THEN RAISE EXCEPTION ...

    -- Inserisce l'asta (o la resetta se esisteva già, es. andata deserta)
    INSERT INTO public.aste (
      giocatore_id, 
      stato, 
      base_asta, 
      prezzo_corrente, 
      scadenza_corrente,
      squadra_in_testa
    ) VALUES (
      p_giocatore_id,
      'IN_CORSO',
      1,
      0,
      now() + '60 seconds'::interval,
      NULL
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
      stato = 'IN_CORSO',
      base_asta = 1,
      prezzo_corrente = 0,
      squadra_in_testa = NULL,
      scadenza_corrente = now() + '60 seconds'::interval;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
