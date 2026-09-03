-- L'admin può chiamare per conto di un manager assente.
--
-- Il caso: un manager non c'è e lascia all'admin l'elenco dei giocatori da
-- chiamare, in ordine. Quando arriva il suo turno, l'admin deve poter chiamare
-- al posto suo, e il giocatore deve risultare **chiamato da lui, al prezzo
-- base**, con gli altri liberi di rilanciare.
--
-- ## Perche' `avvia_asta_admin` non bastava
--
-- Sono due azioni diverse, e finora l'unica disponibile all'admin era quella
-- sbagliata per questo scopo:
--
--   * `prenota_chiamata` mette in testa **chi chiama**, senza guardare le liste.
--     E' la chiamata vera e propria, quella che fa il manager di turno.
--   * `avvia_asta_admin` mette all'asta d'ufficio e cerca chi mettere in testa
--     **fra chi ha il giocatore in `liste_aste`**, partendo da quello di turno.
--
-- Con la seconda, chiamare Piotrowski mentre e' il turno di FC Internazionale
-- lo assegnava a un'altra squadra, semplicemente perche' quell'altra lo aveva
-- in lista e FC Internazionale no. Verificato sui dati veri il 2 settembre: su
-- sei giocatori chiamabili, quattro sarebbero finiti in testa a una squadra
-- diversa da quella di turno.
--
-- La delega non e' un'invenzione nuova: `piazza_offerta_asta` e
-- `imposta_massimo_asta` hanno gia' `p_squadra_delega`, e l'admin rilancia per
-- conto di qualcuno da tempo. Mancava solo sulla chiamata.
--
-- ## Cosa NON cambia
--
-- **Il turno resta obbligatorio.** L'admin puo' chiamare per FC Internazionale
-- solo quando e' davvero il suo turno; per anticiparlo c'e' gia'
-- `admin_imposta_turno`. Togliere il controllo qui vorrebbe dire poter chiamare
-- per chiunque in qualunque momento, che e' un potere diverso da quello
-- chiesto.
--
-- Restano identici anche i controlli su rosa piena, ruolo pieno e asta gia' in
-- corso: applicati alla squadra delegata, non a quella dell'admin.
--
-- Corpo copiato alla lettera da `20260806230000_massimi_asta.sql`. Oltre al
-- parametro e al blocco che lo interpreta, cambiano **tre messaggi d'errore**:
-- dicevano «la tua rosa», «hai gia'» e «il tuo turno», che rivolti a un admin che
-- chiama per un altro dicono il falso. E il valore di ritorno porta ora squadra
-- e prezzo, che servono a confermare a schermo chi e' finito in testa.

CREATE OR REPLACE FUNCTION public.prenota_chiamata(
    p_giocatore_id INTEGER,
    p_squadra_delega UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_squadra_id UUID;
    v_quotazione INTEGER;
    v_count INTEGER;
    v_ordine UUID[];
    v_indice INTEGER;
    v_asta_id UUID;
BEGIN
    -- NUOVO: la delega. Senza, si comporta esattamente come prima.
    IF p_squadra_delega IS NOT NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un admin può chiamare per conto di un''altra squadra.';
        END IF;
        v_squadra_id := p_squadra_delega;
    ELSE
        v_squadra_id := public.mia_squadra_id();
    END IF;

    IF v_squadra_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna squadra associata al profilo.';
    END IF;

    IF public.rosa_completa(v_squadra_id) THEN
        RAISE EXCEPTION 'La rosa è già completa: non si possono chiamare altri giocatori.';
    END IF;

    IF public.ruolo_pieno(v_squadra_id, p_giocatore_id) THEN
        RAISE EXCEPTION 'Numero massimo di portieri già raggiunto (%).',
            COALESCE((SELECT slot_p FROM public.regole_lega LIMIT 1), 3);
    END IF;

    SELECT ordine_chiamata, indice_chiamata INTO v_ordine, v_indice
    FROM public.regole_lega LIMIT 1;

    IF v_ordine IS NOT NULL AND array_length(v_ordine, 1) > 0 THEN
        IF v_ordine[v_indice] IS DISTINCT FROM v_squadra_id THEN
            RAISE EXCEPTION 'Non è il turno di questa squadra!';
        END IF;
    END IF;

    SELECT count(*) INTO v_count FROM public.aste WHERE stato IN ('IN_CORSO', 'CHIAMATA');
    IF v_count > 0 THEN
        RAISE EXCEPTION 'C''è già un''asta in corso o in attesa di avvio.';
    END IF;

    SELECT quotazione INTO v_quotazione FROM public.giocatori WHERE id = p_giocatore_id;
    IF v_quotazione IS NULL THEN v_quotazione := 1; END IF;

    INSERT INTO public.aste (
        giocatore_id, stato, base_asta, prezzo_corrente,
        squadra_in_testa, rilanci, abbandoni, consuma_turno
    ) VALUES (
        p_giocatore_id, 'CHIAMATA', v_quotazione, v_quotazione,
        v_squadra_id, '[]'::jsonb, '[]'::jsonb, TRUE
    )
    ON CONFLICT (giocatore_id) DO UPDATE SET
        stato = 'CHIAMATA',
        base_asta = v_quotazione,
        prezzo_corrente = v_quotazione,
        squadra_in_testa = v_squadra_id,
        rilanci = '[]'::jsonb,
        abbandoni = '[]'::jsonb,
        scadenza_corrente = NULL,
        consuma_turno = TRUE
    RETURNING id INTO v_asta_id;

    DELETE FROM public.massimi_asta WHERE asta_id = v_asta_id;

    RETURN json_build_object('success', true, 'squadra_in_testa', v_squadra_id, 'prezzo', v_quotazione);
END;
$$;

NOTIFY pgrst, 'reload schema';
