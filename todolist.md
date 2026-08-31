# Cose da fare — FantaAsta

Il posto unico delle attività aperte. Sta nel repository e non nella memoria di
una conversazione, perché una conversazione finisce.

**Regola:** si aggiorna a ogni lavoro. Quando una voce si chiude, si sposta in
*Fatto di recente* con la data; quando ne nasce una, ci si scrive dentro il
contesto per riprenderla **a freddo** — file, perché è un problema, e quale
scorciatoia apparente sarebbe sbagliata.

Il piano di collaudo è un documento diverso: [TEST-PRODUZIONE.md](TEST-PRODUZIONE.md)
dice cosa va verificato, questo dice cosa va costruito.

---

## Prestazioni e infrastruttura

### `fetchAsta()` ricarica tutta la lista chiamate ogni 15 secondi

`src/components/TabelloneAsta.tsx` rifà cinque interrogazioni a ogni giro del
salvagente e a ogni evento in tempo reale.

**Non è un problema di consumi, e ora è misurato invece che supposto.** L'asta
del 27 agosto è costata 126 MB di egress su 5 GB e 4.832 messaggi realtime su
2 milioni: quaranta volte di margine sulla voce più stretta. Anche con le liste
piene — quel giorno erano corte, perché le rose erano state importate e non
battute — non si arriva vicino al limite.

Resta eventualmente una questione di **reattività**, non di quota: cinque query
ogni 15 secondi su liste lunghe si sentono sul telefono di chi ha la linea
lenta. Ma è un'ottimizzazione da fare se qualcuno se ne lamenta, non prima.

**Trappola:** non disattivare il salvagente quando non c'è un'asta in corso. È
esattamente il caso per cui esiste.

### Consumi Vercel: letti il 29 agosto, nessun problema

Finestra di 30 giorni, 30 luglio - 29 agosto, piano Hobby.

| Voce | 8 ago | 29 ago | Limite | Quanto ne usiamo |
|---|---|---|---|---|
| Fast Data Transfer | 44,51 MB | 216,51 MB | 100 GB | 0,2% |
| Fast Origin Transfer | 34,09 MB | 174,37 MB | 10 GB | 1,7% |
| Edge Requests | 4.852 | 23.551 | 1M | 2,4% |
| Function Invocations | 5.973 | 25.000 | 1M | 2,5% |
| **Fluid Active CPU** | — | **33m 57s** | **4h** | **14%** |
| Fluid Provisioned Memory | — | 10,1 GB-Hrs | 360 GB-Hrs | 2,8% |
| Edge Request CPU Duration | — | 4s | 1h | 0,1% |

**La voce da guardare non è la banda ma Fluid Active CPU**, l'unica a due
cifre. Le altre sono così lontane dal limite che non varrà la pena riguardarle.

I due giorni dell'asta (27-28 agosto) isolati: 31,36 MB di Fast Data, 25,29 MB
di Fast Origin, 3.500 Edge Requests, 4.600 invocazioni, **4m 32s di Fluid
Active CPU**. Cioè una serata d'asta costa circa il **2% del mese** sulla voce
più stretta: dieci aste come quella starebbero dentro il piano gratuito.
Il picco orario si vede alle 18 del 27, con 5,1 MB in un'ora.

I 46 minuti di Build CPU di quei due giorni sono i nostri deploy, non i
manager: non c'entrano con il carico dell'asta.

**Vercel non è il collo di bottiglia.** Resta da guardare Supabase.

### Consumi Supabase: letti il 29 agosto, e il tempo reale ha retto

Ciclo 12 agosto - 12 settembre, piano Free, filtrato sul solo progetto
`asta-fantacalcio`.

| Voce | 8 ago | 29 ago | Limite | Quanto ne usiamo |
|---|---|---|---|---|
| **Picco connessioni realtime** | **6** | **13** | 200 | 6,5% |
| Messaggi realtime | 1.000 | 4.832 | 2.000.000 | 0,2% |
| Egress | 71 MB | 126 MB | 5 GB | 2,5% |
| Dimensione database | 26,83 MB | 29 MB | 500 MB | 6% |
| Utenti attivi mensili | 46 | 44 | 50.000 | <1% |

**La domanda aperta aveva una risposta, ed è quella buona.** Il picco di 13
connessioni contemporanee è del 27 agosto — il grafico giornaliero lo mostra
come unica barra che tocca il tetto, con il 18 agosto (il collaudo in due) a 8
e tutti gli altri giorni fra 1 e 4. A database ci sono **10 squadre e 11
account**: 13 connessioni sono più delle persone, quindi il tempo reale è
arrivato a tutti e qualcuno aveva due schede o due dispositivi aperti.

Non era «sembrava funzionare» grazie al salvagente: funzionava.

Anche i messaggi realtime dicono la stessa cosa: 4.832 nel ciclo, quasi tutti
concentrati il 27. Filtrando sul solo progetto dell'asta i numeri non cambiano,
quindi gli altri due progetti dell'organizzazione non c'entrano nulla.

### Duplicare il sito per una seconda lega

Rimandato dall'utente. Nota: Supabase somma egress e messaggi realtime di
**tutti** i progetti dell'organizzazione; solo lo spazio del database è per
progetto.

---

## Rimandato con dossier a parte

### Scheda giocatore in `/svincolati` — accantonata: si paga

**Chiusa il 29 agosto, e non per mancanza di tempo.** Anche le chiamate di
API-Football si pagano: il «piano gratuito» descritto nel confronto non
corrisponde a quello che si trova aprendo un account. Nessuna delle tre fonti
esaminate regge quindi il requisito di partenza — dati completi **e** costo
zero.

Non è una voce da riaprire con un tentativo: **serve una fonte nuova**, e prima
di rimettersi a progettare va verificato che sia davvero gratuita aprendo un
account, non leggendo una pagina di prezzi.

Cosa resta a terra, se un giorno si riprende:

- il piano completo — tabella, sincronizzazione, abbinamento, interfaccia e le
  trappole — è in [docs/scheda-giocatore.md](docs/scheda-giocatore.md);
- `scripts/sonda-api-football.mts` è scritta e funziona: tre richieste che
  dicono se una fonte copre la stagione in corso e quanto costa un giro
  completo. Adattarla a un'altra API è un lavoro di mezz'ora, e resta il modo
  giusto di cominciare: **prima la misura, poi il codice**;
- `API_FOOTBALL_KEY` è documentata in `.env.example` e non è mai stata
  valorizzata da nessuna parte. Non c'è niente da revocare.

**Perché BigBallsData non torna utile:** non ha nazionalità, data di nascita,
nome e cognome né storico per stagione. Il problema non era la quota, erano i
dati.

---

## Deciso da te, non ancora fatto

### La pastiglia del reparto in `/trasferimenti`

Il 29 agosto le pastiglie P/D/C/A prima del nome sono sparite da `/rose` e da
`/mia-rosa`, come chiesto. Restano in due punti che non erano stati nominati e
che **non ho potuto guardare**, perché si vedono solo a mercato aperto e il
mercato è chiuso: la tabella di `src/app/trasferimenti/TrasferimentiClient.tsx`
e il riquadro d'offerta `src/components/OffertaTrasferimento.tsx`.

Sono lo stesso identico schema — pastiglia colorata, poi il nome, poi i ruoli
Mantra — quindi la modifica è la stessa. Da fare quando il mercato si riapre,
così si vede il risultato invece di indovinarlo.

---

## Da decidere insieme

### La busta si consegna tutta o niente: teniamo la regola?

`submit_buste` pretende **esattamente** tanti giocatori quanti sono gli slot
liberi. Non è un vincolo dell'interfaccia: sta nel database e vale anche per chi
scavalcasse la pagina.

Il tema è emerso il 29 agosto e **non è stato deciso**, perché nel frattempo si
è capito che il problema vero era un altro — la bozza che si perdeva, ora
risolta. Il ragionamento però è già fatto e vale la pena non rifarlo.

**Perché la regola esiste.** Nelle buste chi chiede un giocatore che nessun
altro ha chiesto se lo prende **alla quotazione**, cioè al minimo. Chiedere
tutti gli slot è quindi quasi sempre conveniente: la regola obbliga tutti a
giocarsi quel vantaggio ogni turno, e nessuno può «passare».

**Cosa cambierebbe permettendo di meno.** Il turno diventerebbe veloce — nessuno
aspetta chi deve compilare trenta caselle — ma chi ha fretta ne consegna cinque
e chi ha pazienza trenta, e il secondo riempie la rosa a prezzo di listino
mentre il primo dovrà comprare all'asta. È un vantaggio che oggi la regola
annulla.

**Un caso in cui la regola si rompe da sola:** se i giocatori disponibili
fossero **meno** degli slot liberi, nessuno potrebbe consegnare e la fase
resterebbe bloccata. Oggi è lontano — 215 disponibili contro 30 slot — ma il
vincolo non lo prevede.

Tre strade, dalla meno alla più invasiva: lasciare com'è; permettere di
consegnare meno con un minimo di uno; oppure tenere l'obbligo e tapparlo solo
dove si rompe, cioè quando i disponibili sono meno degli slot. Le ultime due
sono una migration su `submit_buste`.

### Dire ai manager che la stellina esiste

I preferiti pagano solo se la lista si prepara **prima**. Il 29 agosto tutti
hanno trenta slot da riempire: se scoprono la stellina la sera stessa, si
aspetta come il 27. Vale un messaggio qualche giorno prima della prossima
tornata.

---

## Notato di sfuggita

- **Il collaudo del 29 agosto è stato eseguito sulla produzione** fino alla
  versione 1.21.0, e non ha fatto emergere difetti. **Le caselle nate dopo sono
  da eseguire**: C2e (preferiti, bozza e riempimento) e G2b (la colonna *Buste*
  e gli allineamenti). Resta fuori quello che dipende da una situazione: il
  «Mi ritiro» spostato a destra e la fascia di asta finita vogliono **un'asta in
  corso**, F13b una chiamata dalla console, il blocco K il mercato aperto.
- **Il pulsante *Nuova password* si vede anche dall'admin semplice.** `/admin`
  è protetto da `requireAdmin()`, che lascia passare ADMIN e SUPER_ADMIN,
  quindi *Budget e Fasi* è raggiungibile da entrambi. Il reset però è riservato
  al super admin dalla server action, che risponde *«Accesso negato»*.
  Non è un buco — il controllo è dove conta — ma un pulsante che si vede e
  rifiuta è meno chiaro di uno spento con il motivo, come si è fatto per
  l'icona degli stemmi. Si risolve leggendo il ruolo in
  `src/app/admin/riepilogo/page.tsx` e disegnando la colonna *Accesso* solo per
  il super admin. **Scorciatoia sbagliata:** togliere il controllo dall'azione
  perché "tanto il pulsante non si vede" — quello è l'unico che protegge
  davvero.
- **Le intestazioni di tabella e la specificità.** `.fm-table thead th` vale
  0,1,2 e `.fm-num` 0,1,0: nella stessa `@layer` vince la prima, quindi
  un'intestazione marcata `fm-num` restava allineata a sinistra mentre i suoi
  valori andavano a destra. Corretto il 29 agosto con una regola esplicita in
  `globals.css`. **Chi aggiunge una colonna nuova con un allineamento suo
  controlli che l'intestazione lo segua**, perché il difetto non salta all'occhio
  come un errore ma come «ogni colonna fa storia a sé».
- **A 320px il nome della squadra si tronca** in `/svincolati`. È il ripiego
  previsto e non un difetto scoperto per caso: sotto quella larghezza le
  quattro colonne non entrano. Riguarda i telefoni molto vecchi (iPhone SE di
  prima generazione); se salta fuori qualcuno che ce l'ha, la strada è togliere
  una colonna, non stringerle tutte.
- **`public/loghi/serie-a.png` non è usato da nessuna parte.** È lo stemma del
  campionato, scaricato insieme agli altri venti. Lasciato lì perché non dà
  fastidio e potrebbe servire da segnaposto, ma se si vuole fare pulizia si può
  togliere.
- **F13b non è ancora chiuso, e il 29 agosto non era provabile.** L'elenco di
  `/buste` nasconde i giocatori già in coda per l'asta — verificato il 27
  agosto — ma nessuno ha ancora chiamato `submit_buste` per controllare che la
  funzione li **rifiuti**. Il tentativo del 29 si è fermato subito: `liste_aste`
  era **vuota**, perché le aste erano chiuse e si era in fase buste.
  **Si prova solo quando c'è una coda**, cioè subito dopo uno spoglio che
  produce contesi. Lo script è di dieci righe: prendere un giocatore da
  `liste_aste`, infilarlo in una lista per il resto valida e verificare che
  venga rifiutato — e poi rifare la stessa lista senza di lui, per sapere che a
  farla rifiutare è stato lui e non altro.
- **D20, terza casella.** Chi ha il tetto più alto ed è già in testa non deve
  farsi rilanciare da sé piazzando un rilancio a mano. Il ramo non è stato
  esercitato nell'asta del 27.
- Tre `any` nel lint di `src/app/svincolati/SvincolatiClient.tsx` (righe 30, 71,
  140), preesistenti.
- `src/app/buste/page.tsx`: `loadData` è usata dentro l'`useEffect` di riga 67
  ma dichiarata dopo, e il lint lo segnala come **errore** (non warning).
  Preesistente, e il build passa lo stesso perché `next build` non esegue
  eslint. Si risolve spostando `loadData` sopra l'effect o avvolgendola in
  `useCallback`; la seconda strada obbliga a sistemare anche le dipendenze,
  quindi non è la modifica di una riga che sembra.

---

## La riga di stato

### Il tabellone e la regia ricalcolano le stesse frasi della barra

`src/utils/statoLega.ts` (v1.25) compone in un posto solo le frasi che dicono
«a che punto siamo». `src/components/TabelloneAsta.tsx` e
`src/app/admin/asta/page.tsx` continuano a ricalcolare le proprie, sparse in
una decina di punti e già oggi duplicate fra loro: «Tocca a X», «Prenotato»,
«In attesa che l'admin avvii il timer», «Asta finita: il tempo è scaduto».

**Non è stato accorpato subito di proposito**, ed è la ragione da non
dimenticare: la barra *riassume* e il tabellone *dettaglia*, quindi i testi
sono legittimamente diversi. Finché restano diversi la duplicazione non mente,
e riscrivere due componenti vivi durante un'asta in corso è il tipo di lavoro
che si porta dietro un difetto proprio dove costa di più.

Se un giorno si accorpa: `descriviStato()` andrebbe estesa con una modalità
"estesa", non copiata.

### La barra sa dei ritiri, ma non li vede tutti allo stesso modo

**Risolto il 31 agosto, e piu' a buon mercato del previsto.** La voce diceva che
`isSoloLeft` costava due query a ogni evento su ogni pagina. Non era vero: gli
abbandoni stanno gia' in `aste.abbandoni`, che **viaggia nel payload realtime**,
e i contendenti si leggono una volta sola quando cambia il giocatore in asta,
non a ogni rilancio. Il criterio in `descriviStato()` e' copiato alla lettera da
`TabelloneAsta.isSoloLeft`.

Quel che resta scoperto: se qualcuno si ritira **mentre il tempo reale non
consegna**, la fascia se ne accorge al giro del salvagente (30 secondi) invece
che subito. Non e' un caso da inseguire: e' lo stesso ritardo di tutto il resto.

**Scorciatoia sbagliata:** rileggere i contendenti nella callback dei rilanci.
`liste_aste` per quel giocatore non cambia durante l'asta, e ci si ritroverebbe
una query per ogni offerta moltiplicata per i manager collegati.

### L'annuncio non sopravvive a un ricaricamento

Voluto: «X si aggiudica Y per N crediti» vive dieci secondi in memoria del
browser, non a database. Chi ricarica proprio in quell'istante non lo vede, e
lo storico sta già in `/aste`.

Se un giorno lo si vuole persistente, la strada è una tabella `eventi_asta`
scritta dalle funzioni SQL — costo: una migration, RLS, GRANT, e cinque o sei
`SECURITY DEFINER` da ritoccare **ricopiandone il corpo alla lettera**. È stata
soppesata e scartata il 31 agosto: non valeva quel rischio per un annuncio.

---

## Fatto di recente

| Quando | Cosa |
|---|---|
| 31 ago 2026 | La fascia non conta piu' i secondi dopo un ritiro, e ha un'etichetta di fase |
| 31 ago 2026 | La riga di stato: una fascia sotto la barra dice sempre a che punto siamo |
| 29 ago 2026 | La busta deve contenere i portieri che mancano, e non lo controllava nessuno |
| 29 ago 2026 | La colonna *Buste* dice sì o no, e le intestazioni seguono le colonne |
| 29 ago 2026 | La bozza non si rileggeva: la cancellava l'effetto che la salva |
| 29 ago 2026 | I preferiti si aggiungono alla busta invece di sostituirla |
| 29 ago 2026 | La busta a metà non si perde più, e l'admin vede chi ha consegnato |
| 29 ago 2026 | Preferiti con la stellina in `/svincolati`, e le buste si riempiono da lì |
| 29 ago 2026 | Tutte le pagine hanno la stessa larghezza e lo stesso rientro |
| 29 ago 2026 | Su schermo grande i filtri stanno su una riga sola |
| 29 ago 2026 | Il pulsante del reset copia la sola password |
| 29 ago 2026 | Le rose seguono l'ordine della leggenda Mantra, e così il filtro |
| 29 ago 2026 | Via la pastiglia del reparto da `/rose` e `/mia-rosa`, ruoli Mantra in colonna |
| 29 ago 2026 | Incolonnati anche gli assegnati, con la data in forma breve |
| 29 ago 2026 | Sul telefono ruoli, squadra, età e crediti sono incolonnati |
| 29 ago 2026 | Titoli di pagina e testate dei riquadri tutti allineati a sinistra |
| 29 ago 2026 | Stemmi di Serie A anche in `/aste` e `/buste` |
| 29 ago 2026 | Via la lettera del reparto anche da `/aste`, `/buste`, regia e tabellone |
| 29 ago 2026 | Via la lettera del reparto dalla riga degli svincolati |
| 29 ago 2026 | Stemmi di Serie A in `/svincolati` |
| 29 ago 2026 | Gli errori di autenticazione parlano italiano |
| 28 ago 2026 | Su schermo grande *Mi ritiro* non sta più in mezzo ai nomi in gara |
| 28 ago 2026 | Accesso e cambio password sfrondano gli spazi ai bordi |
| 28 ago 2026 | Il super admin genera una password nuova a una squadra da *Budget e Fasi* |
| 28 ago 2026 | L'import del budget non riscrive più le password scelte, se la cella è vuota |
| 28 ago 2026 | Il manager si cambia la password da *La mia Rosa* |
| 28 ago 2026 | Il tabellone d'asta sta in una schermata di telefono: da 917 a 611px |
| 28 ago 2026 | Tolta la seconda pagina di accesso: `/login` rimanda alla home |
| 28 ago 2026 | Sommario buste in fondo a `/buste`, con gli esiti già spogliati di tutte le squadre |
| 28 ago 2026 | In `/asta` una fascia dice che l'asta è finita, e i rilanci si spengono |
| 28 ago 2026 | `/buste` ha filtri per squadra ed età e l'ordinamento, e condivide il comparatore con `/svincolati` |
| 28 ago 2026 | In `/buste` una × su ogni nome scelto lo toglie dalla lista |
| 28 ago 2026 | In `/buste` una pastiglia dice se quello che vedi è già salvato sul server |
| 27 ago 2026 | L'export delle rose esce nel formato di fantacalcio.it, e l'import è riuscito |
| 27 ago 2026 | Il massimo automatico non rilancia più su chi è già in testa |
| 27 ago 2026 | In *Sommario aste* restano due totali invece di quattro |
| 27 ago 2026 | La scheda del listone avvisa che azzera le rose |
| 27 ago 2026 | Negli svincolati la ricerca trova anche la squadra reale |
| 27 ago 2026 | Liste compatte sul telefono: schede a tre righe, filtri a scomparsa |
| 27 ago 2026 | Chi è in coda per l'asta non risulta più svincolato, con guardia in `submit_buste` |
| 27 ago 2026 | Il pannello d'asta smette di stirarsi su schermo grande |
