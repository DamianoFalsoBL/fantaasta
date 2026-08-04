# Prompt — Sito Aste Fantacalcio (v5)

## 1. Ruolo e modalità di lavoro

Agisci come sviluppatore full-stack senior specializzato in Next.js e Supabase.

Regole di collaborazione, da rispettare per tutta la sessione:

- Procedi **una fase alla volta**, nell'ordine indicato al punto 8. Non anticipare fasi successive.
- Prima di scrivere codice per una fase, esponi il **piano** (file da creare/modificare, oggetti DB, scelte tecniche, dubbi) e **attendi la mia conferma esplicita**.
- Al termine di ogni fase fornisci i **criteri di verifica** (cosa devo provare e cosa mi aspetto di vedere) e attendi il mio esito prima di proseguire.
- Se un requisito è ambiguo, **chiedi** invece di assumere. Elenca le assunzioni residue in fondo a ogni risposta.
- Non introdurre dipendenze o servizi esterni senza segnalarmelo e motivarlo.
- Ogni modifica allo schema passa da una **migrazione versionata**, mai da modifiche manuali nella dashboard Supabase.

## 2. Obiettivo

Realizzare un'applicazione web per la gestione delle **aste di una lega di fantacalcio** tra amici, con **asta live a offerte a tempo** in cui i partecipanti rilanciano direttamente dal sito, più un'area amministrativa per la conduzione dell'asta e la gestione dei dati.

Contesto d'uso: lega privata, partecipanti che si conoscono, uso prevalente da smartphone. La priorità è che l'asta sia **fluida e leggibile**, non blindata.

## 3. Modello di accesso

- **Ogni squadra ha un proprio account** (ruolo `MANAGER`): accede, consulta e rilancia a nome della propria squadra.
- **Un account `ADMIN`**: conduce l'asta, gestisce dati, account e rettifiche. Può offrire per conto di una squadra (partecipante assente o disconnesso), con l'operazione tracciata.
- Nessuna registrazione libera: gli account sono creati dall'admin. Nessuna area pubblica oltre alla pagina di login.
- **La squadra offerente è ricavata sempre da `auth.uid()` lato server**, mai da un `squadra_id` inviato dal client. Non è una misura difensiva: è il modo di garantire che i crediti vengano scalati alla squadra giusta anche in presenza di bug nella UI.

## 4. Stack tecnico

- **Next.js** (App Router, TypeScript) full-stack
- **Supabase**: Postgres gestito, Auth, Realtime, Storage
- **Supabase Auth** per admin e manager
- **Supabase Realtime** per il tabellone dell'asta live
- Accesso al DB: proponi e motiva la scelta tra **Prisma** (schema e migrazioni tipizzate) e il solo client `supabase-js`. Con Prisma servono due connessioni: pooler in *transaction mode* (porta 6543, `?pgbouncer=true`) per il runtime e connessione **diretta non poolata** (porta 5432) per migrazioni e introspezione. Verifica sulla documentazione corrente la forma esatta delle stringhe, che cambia nel tempo.
- Parsing Excel/CSV: SheetJS (`xlsx`) o equivalente; file archiviati su **Supabase Storage** in bucket privato
- UI responsive, approccio **mobile-first**

## 5. Configurazione di base del database

- **RLS attiva su tutte le tabelle**, con **policy permissive**: ogni utente autenticato legge tutti i dati di lega. La trasparenza tra partecipanti è una scelta di progetto, non un compromesso.
- Motivo per cui RLS va comunque attivata: senza di essa, con la chiave `anon` presente nel codice della pagina, le tabelle sono interrogabili da chiunque raggiunga l'URL del progetto. Basta mezza pagina di SQL, scritta una volta.
- **Nessuna policy di scrittura per il client**: `INSERT` e `UPDATE` su `offerte`, `aste`, `tesseramenti` e `squadre` passano solo da **funzioni Postgres** o endpoint server-side. Serve a garantire l'atomicità, non a difendersi da qualcuno.
- La chiave `service_role` va usata **solo lato server**, mai in variabili `NEXT_PUBLIC_` né in codice inviato al browser.

## 6. Modello dati (proposta di partenza, da validare)

- **profili**: `user_id` (Supabase Auth), ruolo (`ADMIN` | `MANAGER`), squadra associata
- **squadre**: nome, slug, budget iniziale, crediti residui (con regola di ricalcolo definita)
- **giocatori**: nome, ruolo (P/D/C/A), squadra di Serie A, quotazione, stato (`LIBERO` | `TESSERATO`)
- **tesseramenti**: squadra, giocatore, prezzo pagato, stagione, data
- **regole_lega**: slot per ruolo, budget standard, rilancio minimo, durata timer, costo minimo per giocatore
- **aste**: giocatore, stato (`PROGRAMMATA` | `IN_CORSO` | `CHIUSA` | `ANNULLATA`), base d'asta, rilancio minimo, durata timer, scadenza corrente, squadra in testa, prezzo finale
- **offerte**: asta, squadra, importo, timestamp server, origine (`MANAGER` | `ADMIN_PER_CONTO`)
- **asta_stato**: proiezione per il Realtime (asta corrente, giocatore, offerta corrente, squadra in testa, scadenza, massimo offribile di ciascuna squadra)
- **log_import**: tipo import, nome file, esito, righe elaborate/scartate, timestamp
- **log_operazioni**: audit delle azioni admin e delle offerte per conto terzi

Nessun dato personale dei partecipanti oltre a nome squadra e credenziali. Nessuna tabella di offerte massime private: il concetto non esiste in questo progetto.

## 7. Requisiti funzionali

### 7.1 Massimo offribile (concetto centrale, visibile a tutti)

Il **massimo offribile** è quanto una squadra può spendere su un singolo giocatore senza restare impossibilitata a completare la rosa. È un valore **calcolato, mai inserito a mano, e pubblico a tutta la lega**: serve proprio a impedire che qualcuno offra oltre le proprie possibilità.

Formula di partenza, da validare con me:

```
massimo_offribile(squadra, ruolo) =
    crediti_residui − (slot_totali_ancora_da_coprire − 1) × costo_minimo_giocatore

vincolo: se gli slot del ruolo sono già pieni → massimo_offribile = 0 (squadra non ammessa all'asta)
```

Requisiti implementativi:

- Il calcolo deve avere **una sola implementazione**, in una funzione o view Postgres, usata sia per visualizzare il valore sia per validare l'offerta. Non duplicarlo in TypeScript per la UI: due implementazioni divergono, e il risultato è un'interfaccia che mostra 96 mentre il server rifiuta a 95.
- Il valore è mostrato accanto a ogni squadra: nella pagina di confronto e **sul tabellone dell'asta live**, aggiornato dopo ogni aggiudicazione.
- Un'offerta superiore al massimo offribile della squadra va **rifiutata dal server** con messaggio esplicito.
- Lato admin, "gestione massimo offribile" significa: configurare i parametri della regola (slot per ruolo, costo minimo) e, in casi eccezionali, forzare una deroga tracciata nel log. Non significa inserire manualmente un importo per squadra.

### 7.2 Home con selettore squadra
- Dopo il login la home mostra per default la **dashboard della squadra dell'utente**: rosa per ruolo, crediti spesi e residui, slot liberi, massimo offribile, ultime aste vinte.
- Un **menu a tendina** consente di passare alla vista di un'altra squadra: tutti i dati sono visibili a tutti.
- La squadra visualizzata è riflessa nell'URL (es. `/?squadra=slug`) e la scelta è persistita lato client, con ritorno immediato alla propria squadra.
- L'admin vede la panoramica di lega come vista iniziale.

### 7.3 Aree di consultazione
- **Elenco aste concluse** con esiti, filtri e ricerca.
- **Elenco aste da fare** / in programma, con quelle in corso in evidenza.
- **Situazione squadre**: confronto tra tutte le squadre con rose, crediti e massimo offribile.
- **Giocatori liberi**: elenco filtrabile per ruolo, squadra di Serie A e quotazione.

### 7.4 Asta live — esperienza del manager
- Tabellone con giocatore all'asta, offerta corrente, squadra in testa e **countdown sincronizzato dal server**, aggiornato in tempo reale.
- Pulsanti di **rilancio rapido** (rilancio minimo, +5, importo libero), con conferma sopra una soglia configurabile.
- Sempre visibili: crediti residui e **massimo offribile propri e degli avversari**, slot disponibili per il ruolo del giocatore all'asta.
- Evidenza delle squadre **non ammesse** all'asta corrente (slot di ruolo pieni o massimo offribile insufficiente): chiarisce subito con chi si sta competendo.
- Messaggi di errore espliciti quando l'offerta è respinta, con la ragione (oltre il massimo offribile, sotto il rilancio minimo, slot pieni, asta già chiusa).
- Un client che si collega a metà asta esegue una **query iniziale di stato completo**, poi sottoscrive gli aggiornamenti.
- La UI deve restare comoda da smartphone durante i rilanci: è la modalità d'uso prevalente.

### 7.5 Motore asta live (lato server)
- L'admin apre l'asta su un giocatore impostando base d'asta, rilancio minimo e durata del timer.
- Ogni offerta valida **azzera il timer** alla durata configurata (anti-sniping).
- **Ogni offerta è atomica.** Implementa l'inserimento come **funzione Postgres** (`plpgsql`, `SECURITY DEFINER`, invocata via RPC) che in un'unica transazione con lock sulla riga dell'asta: identifica la squadra da `auth.uid()`, valida importo, rilancio minimo, massimo offribile e slot di ruolo, registra l'offerta, aggiorna scadenza e proiezione di stato. Validazioni sparse nel codice applicativo non sono accettabili: due rilanci ravvicinati produrrebbero stati incoerenti.
- **Chiusura alla scadenza**: il timer non vive nel browser. Definisci un meccanismo server-side affidabile — funzione schedulata (`pg_cron` o Edge Function periodica) che chiude le aste scadute — **più** una valutazione difensiva in lettura, così che un'asta scaduta non risulti mai ancora aperta se lo scheduler ritarda. Spiegami il compromesso tra frequenza dello scheduler e precisione del countdown.
- Alla chiusura, nella stessa transazione: assegnazione al miglior offerente, scalo crediti, creazione del tesseramento, giocatore a `TESSERATO`, ricalcolo del massimo offribile di tutte le squadre.
- **Offerta al fotofinish**: definisci con me la regola per un'offerta che arriva a millisecondi dalla scadenza (accettata se ricevuta dal server entro la scadenza, con eventuale tolleranza dichiarata). Il criterio deve essere lo stesso per tutti e comprensibile a voce durante l'asta.
- Asta deserta: comportamento da definire (giocatore che torna libero, oppure assegnazione alla base d'asta).
- Interruzione e ripresa: se admin o manager perdono la connessione, l'asta resta in uno stato recuperabile; la riconnessione non deve produrre offerte duplicate.

### 7.6 Lato admin
- **Conduzione asta**: apertura, chiusura anticipata, annullamento, offerta per conto di una squadra (tracciata), assegnazione manuale di un giocatore libero fuori asta.
- **Gestione squadre e account**: anagrafica, creazione utenti, reset password, rettifica crediti e rosa.
- **Regole di lega**: slot per ruolo, budget, rilancio minimo, durata timer, costo minimo per giocatore.
- Calendario delle aste programmate.
- Ogni rettifica manuale tracciata in `log_operazioni`, così che a fine asta sia ricostruibile cosa è stato corretto e perché.

### 7.7 Import dati (solo admin, formato Excel/CSV)
Quattro import distinti, ciascuno con: upload → **anteprima in dry-run** con errori e righe scartate → conferma → scrittura in transazione → voce nel log.

1. **Listone giocatori** — ruolo, squadra di Serie A, quotazione.
2. **Squadre parziali** — rose già assegnate, con prezzo pagato.
3. **Budget/crediti** per squadra.
4. **Storico aste** già svolte.

Requisiti trasversali: idempotenza (upsert su chiave naturale da definire), mappatura colonne tollerante a intestazioni diverse, validazione di coerenza (crediti spesi ≤ budget, nessun giocatore su due squadre, ruolo valido), parsing **lato server**.

### 7.8 Non funzionali
- Countdown sincronizzato con l'orario del server: tutti i manager devono vedere **lo stesso tempo residuo**.
- Latenza contenuta sui rilanci: nessuno deve perdere un'asta per un ritardo dell'interfaccia.
- Considera i limiti del piano Supabase in uso (connessioni concorrenti, messaggi Realtime, sottoscrizioni per client) e segnalami se l'architettura rischia di superarli con tutti i partecipanti collegati insieme.

## 8. Ordine delle fasi

| Fase | Contenuto | Uscita attesa |
|---|---|---|
| 0 | Scaffolding Next.js, progetto Supabase, variabili d'ambiente, struttura cartelle | app che parte in locale e si connette al DB |
| 1 | Schema e migrazioni, RLS con policy permissive, Auth admin e manager | login funzionanti per entrambi i ruoli |
| 2 | Import Excel/CSV: listone → squadre parziali → budget → storico aste | dati di lega caricati e coerenti |
| 3 | Regole di lega + **funzione del massimo offribile** con casi di prova | valore corretto e coerente tra UI e validazione |
| 4 | Lato admin: gestione squadre, account, giocatori, calendario aste | admin operativo su dati statici |
| 5 | Motore asta: funzione RPC delle offerte, chiusura schedulata | asta corretta anche con rilanci concorrenti |
| 6 | UI asta live per i manager + home con selettore squadra + consultazioni | asta provata con almeno tre sessioni contemporanee |
| 7 | Rifinitura mobile, stati di errore e vuoti, audit, log | applicazione pronta all'uso |

## 9. Punti aperti da definire insieme

- Struttura esatta delle colonne dei file Excel/CSV di import (ti fornirò un file di esempio).
- Regole di lega: slot per ruolo, budget standard, rilancio minimo, durata del timer, costo minimo per giocatore.
- Validazione della formula del massimo offribile su casi concreti.
- Aste a **sessioni** (blocco di giocatori in sequenza) o singole.
- Comportamento in caso di asta deserta e regola per il fotofinish.
- Numero di partecipanti previsti (dimensiona il carico Realtime).
- Piano Supabase e ambiente di deploy per Next.js.

---

**Prima azione richiesta:** non scrivere codice. Rileggi il documento, segnala incongruenze o rischi tecnici che vedi, poni le domande necessarie sui punti aperti e proponi il piano della Fase 0.
