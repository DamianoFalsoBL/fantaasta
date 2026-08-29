-- I preferiti: la lista privata che ogni manager si prepara sfogliando gli
-- svincolati, e da cui poi si riempiono le buste.
--
-- Nasce da un problema misurato all'asta del 27 agosto: chiuse le aste si è
-- aperta la fase buste e tutti hanno aspettato un manager che doveva inserire
-- dieci nomi, cercandoli uno per uno in una lista di 215 giocatori.
--
-- `created_at` non è decorativo: **è l'ordine con cui il pulsante "Riempi dai
-- preferiti" sceglie**, quando i preferiti sono più degli slot liberi.
--
-- Chiave primaria composta invece di un id sintetico: rende impossibile la
-- riga doppia e rende la cancellazione una DELETE su due colonne, senza
-- bisogno di rileggere prima l'id.

CREATE TABLE IF NOT EXISTS public.preferiti (
    squadra_id   UUID        NOT NULL REFERENCES public.squadre(id)   ON DELETE CASCADE,
    giocatore_id INTEGER     NOT NULL REFERENCES public.giocatori(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (squadra_id, giocatore_id)
);

-- La lettura tipica è "tutti i preferiti della mia squadra, in ordine di
-- inserimento": la chiave primaria copre già il primo pezzo, questo indice
-- serve al secondo.
CREATE INDEX IF NOT EXISTS preferiti_squadra_ordine
    ON public.preferiti (squadra_id, created_at);

ALTER TABLE public.preferiti ENABLE ROW LEVEL SECURITY;

-- Una policy sola per tutte le operazioni: ognuno gestisce i propri e basta.
-- Il modello è `gestione_propria_lista` su liste_aste.
--
-- **Senza `OR public.is_admin()`, ed è una differenza voluta rispetto alle
-- buste.** In questa lega l'amministratore gioca: ha una squadra e compete con
-- gli altri. Le buste concedono la lettura all'admin perché gli serve per lo
-- spoglio; i preferiti non servono a nessuno tranne al proprietario, e
-- concederli darebbe a un concorrente la lista della spesa di tutti.
--
-- Resta vero che chi ha la chiave di servizio legge tutto: è inevitabile e
-- vale per qualunque tabella. La policy protegge dai client, che è dove
-- passano i manager.
DROP POLICY IF EXISTS "gestione_propri_preferiti" ON public.preferiti;

CREATE POLICY "gestione_propri_preferiti" ON public.preferiti FOR ALL
  USING (squadra_id = public.mia_squadra_id())
  WITH CHECK (squadra_id = public.mia_squadra_id());

-- Il GRANT va scritto: senza, un database ricreato risponde "permission denied
-- for table preferiti" a ogni query, RLS o non RLS. È già costato tempo su
-- questo progetto.
--
-- Niente UPDATE: una riga di preferiti non si modifica, si aggiunge o si
-- toglie. Concedere un permesso che nessuno usa è superficie in più.
GRANT SELECT, INSERT, DELETE ON public.preferiti TO authenticated;
