-- Allinea il tipo di aste.rilanci e aste.abbandoni a jsonb.
--
-- Sul database di produzione le due colonne erano state create a mano come
-- `uuid[]`. La migration di consolidamento le dichiarava con
-- `ADD COLUMN IF NOT EXISTS ... JSONB`: trovandole già presenti non faceva
-- nulla, e il tipo vecchio restava. In locale invece nascevano da zero come
-- jsonb, quindi la divergenza non emergeva nei test.
--
-- Risultato: `prenota_chiamata` falliva con
--   42804: column "abbandoni" is of type uuid[] but expression is of type jsonb
--
-- jsonb è il tipo giusto per entrambe: `rilanci` conserva oggetti
-- (squadra_id, importo, timestamp), non semplici id, e `abbandoni` usa gli
-- operatori jsonb `?` e `||` nelle RPC.

DO $$
DECLARE
  v_tipo TEXT;
BEGIN
  FOR v_tipo IN SELECT unnest(ARRAY['rilanci', 'abbandoni'])
  LOOP
    IF (
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'aste' AND column_name = v_tipo
    ) IS DISTINCT FROM 'jsonb' THEN
      EXECUTE format('ALTER TABLE public.aste ALTER COLUMN %I DROP DEFAULT', v_tipo);
      -- to_jsonb su un uuid[] produce un array JSON di stringhe, che è
      -- esattamente la forma che il frontend già si aspetta.
      EXECUTE format(
        'ALTER TABLE public.aste ALTER COLUMN %I TYPE jsonb USING COALESCE(to_jsonb(%I), ''[]''::jsonb)',
        v_tipo, v_tipo
      );
      EXECUTE format('UPDATE public.aste SET %I = ''[]''::jsonb WHERE %I IS NULL', v_tipo, v_tipo);
      EXECUTE format('ALTER TABLE public.aste ALTER COLUMN %I SET DEFAULT ''[]''::jsonb', v_tipo);
      EXECUTE format('ALTER TABLE public.aste ALTER COLUMN %I SET NOT NULL', v_tipo);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
