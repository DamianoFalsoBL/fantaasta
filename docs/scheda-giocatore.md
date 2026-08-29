# Scheda giocatore in /svincolati

> **Stato al 29 agosto 2026: accantonata, perché si paga.** Anche le chiamate
> di API-Football sono a pagamento: il «piano gratuito» descritto nel confronto
> non corrisponde a quello che si trova aprendo un account. Nessuna delle tre
> fonti esaminate soddisfa quindi il requisito di partenza — dati completi
> **e** costo zero.
>
> Quello che segue resta valido come progetto: se un giorno si trova una fonte
> davvero gratuita, cambia da dove arrivano i dati, non come si costruisce.
> `scripts/sonda-api-football.mts` è scritta e funziona, e adattarla a un'altra
> API è mezz'ora: resta il modo giusto di cominciare, **prima la misura e poi il
> codice**.
>
> Questo documento sta nel repository e non nel file di piano perché quello è
> **una sola casella che si sovrascrive** a ogni nuova progettazione: i piani
> precedenti della stessa sessione erano già stati cancellati così.

## Cosa è stato chiesto

In `/svincolati`, una colonna in fondo dopo *Quotazione*, con un'icona **i** che
apre una scheda con molte informazioni sul giocatore di quella riga: nome e
cognome, età, ruolo, nazionalità, storico anno per anno di presenze e gol.
Sul telefono, soluzione a scelta di chi implementa.

## La fonte: API-Football, confermata due volte

**BigBallsData, l'API indicata all'inizio, non può fornire quei dati.**
Verificato il 27 agosto su più pagine della loro documentazione, non dedotto:
gli id giocatore sono UUID interni e la documentazione dice esplicitamente di
non portare un id da un altro fornitore; per il calcio non esiste ricerca per
nome, quindi gli id si leggono solo dalle formazioni delle partite (~380
richieste per una mappa che copre solo chi è sceso in campo); e mancano
nazionalità, data di nascita, nome e cognome e lo storico per stagione. Il loro
limite gratuito sarebbe stato abbondante — 1.000 richieste al giorno — ma i dati
non ci sono.

Il 29 agosto un confronto fra tre API gratuite portato dall'utente ha
**confermato la scelta**: API-Football è l'unica delle tre con anagrafica
completa *e* storico per stagione. Football-Data.org non ha l'altezza né lo
storico individuale nel piano gratuito; TheSportsDB ha biografia e immagini ma
nessuna statistica stagionale.

**Attenzione:** la documentazione di API-Football non è stata letta in diretta —
`api-football.com` sta dietro a un controllo anti-bot. Quello che sappiamo viene
dal documento di confronto, non da una verifica nostra. È il motivo per cui il
piano comincia con una sonda invece che con il codice.

## Passo 0 — la sonda, prima di qualunque riga di codice

`scripts/sonda-api-football.mts`, già scritta. Si lancia con:

```
node --experimental-strip-types scripts/sonda-api-football.mts
```

Tre richieste, tre domande:

1. `/status` — quale piano e quanta quota resta oggi;
2. `/leagues?id=135` — **quali stagioni di Serie A sono accessibili** e per
   quali di esse la copertura include i giocatori;
3. `/players?team=505&season=<in corso>&page=1` — la prova del nove: torna gente
   vera con le statistiche?

Il piano gratuito dà 100 richieste al giorno ma **limita le stagioni in un modo
che la documentazione pubblica non specifica**. Se la stagione in corso non è
compresa, la scheda mostrerebbe la carriera di due anni fa: **in quel caso ci si
ferma e si riapre la scelta della fonte**, invece di costruire su un dato
vecchio.

Dalla terza risposta si ricava anche `paging.total`, cioè quante pagine servono
per una squadra: è il numero da cui dipende il costo dell'intera
sincronizzazione, e la sonda lo traduce da sola in richieste e minuti.

## I due vincoli che decidono l'architettura

1. **10 richieste al minuto.** Un giro completo è 20 squadre per ~2 pagine più
   una chiamata per gli id: 40-60 richieste, cioè **4-6 minuti di attesa
   forzata**. Una funzione su Vercel viene interrotta molto prima: il pulsante in
   `/admin/setup` immaginato all'inizio **non è praticabile** senza spezzarlo in
   venti passaggi.
2. **100 richieste al giorno.** Una stagione consuma metà o più della quota:
   **una stagione al giorno, non di più.** Lo storico si accumula in giorni
   successivi.

**Decisione: la sincronizzazione è uno script locale.** La chiave resta in
`.env.local` e **non va mai su Vercel** — una variabile in meno da esporre, e il
sito legge soltanto da Supabase.

## Come va costruito

### 1. Tabella `giocatori_dettagli`

Migration nuova. Chiave `giocatore_id` verso `giocatori` con `ON DELETE
CASCADE`, più `api_player_id` univoco, nome, cognome, data e luogo di nascita,
nazionalità, altezza, peso, `foto_url`, un `jsonb` `stagioni` (annata, squadra,
presenze, titolare, minuti, gol, assist, voto), `abbinamento` (`automatico` o
`manuale`) e `aggiornato_il`.

RLS con lo stesso schema di `giocatori` (vedi
`supabase/migrations/20260801220100_consolidamento.sql`): lettura `USING (true)`,
scrittura riservata a `public.is_admin()`. **La `GRANT SELECT` va scritta
esplicitamente** — dimenticarla è una trappola già costata tempo qui.

Il push della migration lo fa l'utente.

### 2. Lo script di sincronizzazione

`scripts/sincronizza-dettagli.mts`:

- `/teams?league=135&season=<anno>` costruisce la mappa **nostro nome squadra →
  id API**. Le venti squadre coincidono quasi tutte; servono pochi alias
  (`Milan` → *AC Milan*, `Roma` → *AS Roma*). Una squadra non abbinata va
  **segnalata, non saltata in silenzio**.
- per ogni squadra `/players?team={id}&season={anno}&page={n}` finché
  `paging.current < paging.total`;
- **pausa di 6,5 secondi fra una chiamata e l'altra** per stare sotto le 10 al
  minuto, e un contatore che si ferma prima di sfondare le 100 giornaliere
  dicendo a che punto era arrivato;
- `--stagione 2025` rifà il giro su un'annata precedente in un giorno diverso,
  **accodando** al `jsonb` invece di sostituirlo.

### 3. L'abbinamento, che è la parte che può sbagliare in silenzio

I nostri nomi sono in formato Fantacalcio: **466 cognomi secchi, 82 con
l'iniziale** («Miranda J.»), e **14 cognomi condivisi da due giocatori**
(thuram, colombo, konè, tourè, adams, moro, perez, stankovic e altri).

Si abbina **dentro la rosa del club**, il che scioglie quasi tutte le ambiguità,
confrontando il cognome normalizzato — minuscolo e senza accenti, la
normalizzazione c'è già in `slugify` dentro `src/app/admin/actions.ts`. Se
restano due candidati decidono l'iniziale del nome e l'età, che a listone
abbiamo.

Lo script chiude con tre elenchi: **abbinati, ambigui, non trovati** — stessa
forma con cui `importListone` riporta le «Fantasquadre non trovate». Le
correzioni a mano stanno in `scripts/abbinamenti-manuali.json`, una mappa
`{ "giocatore_id": api_player_id }` versionata, applicata **prima** di ogni
euristica.

**Trappola:** un abbinamento sbagliato mostra la carriera di un altro giocatore,
e sembra un dato invece che un guasto. I tre elenchi si leggono davvero, e i
primi dieci abbinamenti si controllano a mano prima di fidarsi degli altri 539.

### 4. La scheda

- Colonna in fondo a `/svincolati` con l'icona **i**. Sul telefono la tabella è
  già in formato scheda (`.fm-table-compatta` + `.fm-table-incolonnata`):
  **l'icona va nella riga del titolo accanto al nome, non in una quinta
  colonna** — le tracce sono calibrate al pixel e non c'è spazio.
- `src/components/SchedaGiocatore.tsx`, modellato su
  `src/components/Conferma.tsx`, da cui si riprende la meccanica già risolta:
  chiusura con Esc, clic sullo sfondo, focus all'apertura, `aria-modal`. Sul
  telefono si apre a tutta pagina dal basso.
- **La foto punta al CDN di API-Football**, deciso dall'utente il 29 agosto
  sapendo che è la strada scartata per gli stemmi delle squadre. Serve un
  `onError` che nasconde l'immagine: se cambiano gli indirizzi la scheda perde
  la foto invece di riempirsi di riquadri rotti.
- **L'icona di chi non è stato abbinato resta visibile ma spenta**, con il
  motivo. Farla sparire sembrerebbe un difetto della pagina.

### 5. Dove non va la chiave

Solo in `.env.local`. Niente su Vercel, niente nel frontend — stessa regola
della service role scritta in `AGENTS.md`. Il sito non parla mai con
API-Football: legge `giocatori_dettagli` come legge `giocatori`.

## Verifica

1. **La sonda**, prima di tutto: se la stagione in corso non è coperta, ci si
   ferma.
2. **Il costo misurato, non stimato**: quante richieste consuma un giro completo.
3. **Dieci abbinamenti a campione** controllati a mano, scelti fra i cognomi
   condivisi: quelli sono i casi che sbagliano.
4. Quanti dei 549 hanno un dettaglio, quanti no e perché.
5. **La pagina a 360, 375 e 1280px**: la scheda di `/svincolati` deve restare di
   **76px** e le colonne allineate. Se l'icona la fa crescere va rimpicciolita,
   non accettata.
6. Un giocatore non abbinato mostra l'icona spenta con il motivo, non un buco.
7. **La chiave non deve comparire nel bundle**: `grep` dentro `.next` dopo il
   build.

## Cosa serve dall'utente

- **Un account gratuito su API-Football** (<https://dashboard.api-football.com/register>,
  non chiede la carta) e la chiave in `.env.local` come `API_FOOTBALL_KEY`.
  È il passaggio che l'assistente non fa.
- **Il push della migration** con `npx supabase db push`, quando sarà pronta.
