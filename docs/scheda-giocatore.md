# DA FARE IN FUTURO — Scheda giocatore in /svincolati

> **Stato: rimandato.** Niente è stato implementato. Ricerca fatta il 27 agosto
> 2026, decisione sulla fonte dati presa, resta da costruire.
>
> Questo documento nasce dal file di piano usato quel giorno. È stato portato
> nel repository il 28 agosto perché quel file è **una sola casella che si
> sovrascrive** a ogni nuova progettazione: i tre piani precedenti della stessa
> sessione erano già stati cancellati così. Qui è versionato, e
> [todolist.md](../todolist.md) ci rimanda dalla voce *Scheda giocatore*.

## Cosa era stato chiesto

In `/svincolati`, una colonna in fondo dopo *Quotazione*, con un'icona **i** che
apre una scheda con molte informazioni sul giocatore di quella riga: nome e
cognome, età, ruolo, nazionalità, storico anno per anno di presenze e gol.
Sul telefono, soluzione a scelta di chi implementa.

## Il vincolo che ha cambiato la scelta

L'API indicata inizialmente — **BigBallsData** (`https://api.bigballsdata.com/v1/`)
— **non può fornire quei dati**. Verificato su più pagine della loro
documentazione, non dedotto:

- gli id giocatore sono **UUID interni**; la documentazione dice esplicitamente
  di non portare un id da un altro fornitore, e passare il nostro numero di
  listone (es. `7294`) restituisce `400 bad_request`;
- per il calcio **non esiste ricerca per nome**: gli id si leggono solo dalle
  formazioni delle partite (`/v1/stored/matches/:id/lineups`), cioè ~380
  richieste per costruire una mappa che copre solo chi è sceso in campo;
- gli endpoint Serie A sono sei — partite, classifiche, storico trasferimenti,
  palmarès, capocannonieri, xG — più `/v1/players/:id/club-form`, che dà
  presenze, gol, assist, minuti e voto **della sola stagione 2025-26**;
- **niente nazionalità, niente data di nascita, niente nome e cognome, niente
  storico anno per anno.** La loro documentazione segnala anche che
  *«player_season is not currently ingesting»*.

Il limite gratuito invece sarebbe stato abbondante: 1.000 richieste al giorno,
2.000 collegando GitHub.

**Fonte scelta: API-Football (api-sports.io).** Ha tutti i campi richiesti —
nome e cognome, età, data e luogo di nascita, nazionalità, altezza, peso, foto,
presenze/gol/assist/minuti per stagione — e permette di elencare i giocatori
**squadra per squadra**, quindi bastano ~20 richieste per coprire tutti e 548
invece di 380.

**Domanda rimasta aperta:** quante stagioni di storico. Non è stata scelta.
Riferimento: ~20 richieste per la sola stagione in corso, ~60 per tre stagioni,
~100 per cinque — e il piano gratuito dà **100 richieste al giorno** e limita le
stagioni accessibili in un modo che la documentazione pubblica non specifica.
**Si saprà solo con una chiave in mano: è la prima cosa da misurare.**

## Il nostro lato, misurato sul database

548 giocatori a listone. I nomi sono nel formato Fantacalcio:

- **466 sono cognomi secchi** («Alajbegovic», «Angelino»);
- **82 hanno l'iniziale del nome** («Miranda J.», «Adams C.»);
- **14 cognomi sono condivisi** da due giocatori: thuram, colombo, konè, tourè,
  adams, moro, perez, el azzouzi, carboni, stankovic e altri quattro.

Colonne disponibili per l'aggancio in `giocatori`: `id` (listone), `nome`,
`ruolo`, `squadra` (club di Serie A), `eta`, `ruolo_mantra`, `quotazione`.
Squadra ed età bastano a sciogliere quasi tutti i casi ambigui, ma **qualcuno
resterà da abbinare a mano**.

## Come andrebbe costruito

**I dati vanno copiati nel nostro database, non chiesti a ogni apertura della
scheda.** Con 100 richieste al giorno e quattordici manager che sfogliano una
lista di 548 giocatori, una chiamata per clic esaurirebbe la quota in pochi
minuti. La scheda deve leggere da noi.

1. **Tabella nuova** `giocatori_dettagli`, chiave `giocatore_id` verso
   `giocatori`, più i campi anagrafici e un jsonb per le stagioni. Lettura
   libera come `giocatori`, scrittura solo service role.
2. **Sincronizzazione da super admin**, in `/admin/setup` accanto agli import
   esistenti: scorre le 20 squadre di Serie A, abbina per cognome + club, scrive
   la tabella e **riporta l'elenco dei non abbinati** — stessa forma con cui
   `importListone` riporta le «Fantasquadre non trovate» (vedi
   `src/app/admin/actions.ts`).
3. **La chiave sta solo lato server.** Variabile d'ambiente su Vercel, usata
   dentro una server action o un route handler. Mai nel frontend: stessa regola
   della chiave di servizio Supabase, scritta in `AGENTS.md`.
4. **La colonna e la scheda** in `src/app/svincolati/SvincolatiClient.tsx`. Sul
   telefono non serve una colonna: la tabella è già in formato scheda compatta
   (`.fm-table-compatta`, introdotto in 1.8.0), quindi l'icona va nella riga del
   titolo e la scheda si apre a tutta pagina dal basso, non come finestrella.
5. **Riuso**: `src/components/Conferma.tsx` è già la finestra modale del
   progetto — da guardare prima di scriverne un'altra.

### Trappole da non ripetere

- **Non chiamare l'API dal browser.** Oltre alla chiave esposta, la quota è per
  chiave, non per utente: un solo manager che scorre la lista la brucia.
- **Non dare per buono l'abbinamento senza guardarlo.** Con 14 cognomi doppi,
  un aggancio sbagliato mostra la carriera di un altro giocatore — un errore che
  sembra un dato e non un guasto. Serve il rapporto dei non abbinati e un modo di
  correggerli a mano.
- **Non far sparire l'icona** per chi non è stato abbinato: va lasciata spenta
  con il motivo, altrimenti sembra un difetto della pagina.
- Il piano gratuito limita le stagioni: **provare prima con una chiave vera** su
  dieci giocatori del nostro listone, e solo dopo decidere quante stagioni
  mostrare.

## Cosa serve da te, quando si riprende

Un account gratuito su API-Football e la chiave, da mettere fra le variabili
d'ambiente su Vercel: quello è un passaggio tuo, non mio.
