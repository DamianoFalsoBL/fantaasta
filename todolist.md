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

### Modalita' di lega: asta libera oppure a buste

Chiesto il 5 settembre. Un interruttore nella dashboard super admin sceglie fra
la lega di oggi (liste chiamate importate + buste) e un'**asta libera**: rose
vuote, budget uguale, chi e' di turno chiama qualunque giocatore del listone.

**Prima del codice va deciso questo:** 14 squadre x 30 slot fanno **420 aste**.
A un minuto scarso l'una sono **sette ore**, col timer dimezzato tre e mezza.
E' esattamente il problema che le buste risolvono — riempiono la rosa in un
colpo solo e all'asta mandano solo i contesi. Da capire se si accetta di
spezzare l'asta in piu' serate, se in quella modalita' i timer si accorciano, o
se la cosa si ferma qui.

Secondo effetto dello stesso tipo: con tutti in gara su ogni giocatore, la
chiusura anticipata «si sono ritirati tutti tranne uno» pretenderebbe tredici
*Mi ritiro* per ogni asta. In pratica ogni asta andrebbe sempre a scadenza.

**La buona notizia: il database e' gia' quasi pronto.** Verificato funzione per
funzione il 5 settembre:

- `squadra_in_gara` (`20260802140000_solo_partecipanti.sql:12-37`) con zero
  righe in `liste_aste` restituisce **true per tutti** — il commento in testa
  dice che e' voluto. Da li' passano `piazza_offerta_asta`, `abbandona_asta`,
  `imposta_massimo_asta` e `risolvi_massimi`: tutte gia' corrette;
- `calcola_massimo_offribile` (`20260801220200_rpc_consolidate.sql:60-111`) a
  lista vuota **degrada esattamente nella formula dell'asta classica**,
  `crediti − (slot_liberi − 1) × costo_minimo`. Non va toccata;
- `prenota_chiamata` non consulta mai le liste: funziona gia' cosi' com'e';
- `idsInCodaAsta` e l'extra budget in NavBar degradano entrambi nel modo giusto.

**Cosa si rompe, in ordine di gravita':**

1. **Nessuno sarebbe mai di turno.** `genera_ordine_chiamata`
   (`20260801220200_rpc_consolidate.sql:426-460`) costruisce l'ordine con un
   `JOIN liste_aste`: a tabella vuota l'ordine e' `{}`. E `prenota_chiamata`
   **salta il controllo del turno quando l'ordine e' vuoto** — chiunque
   potrebbe chiamare in qualsiasi momento. Va sganciato dal join, con criterio
   «rosa non completa». Stessa cosa per `avanza_turno_chiamata` (`:376-423`).
2. **I rilanci disabilitati per tutti.** `TabelloneAsta.tsx:589`
   (`isParticipant`) legge le righe grezze di `liste_aste` **senza il fallback
   "vuoto vuol dire tutti"** che il server ha in `squadra_in_gara`. Righe 629 e
   638: pulsanti bloccati con «Non sei fra i contendenti», mentre il server
   accetterebbe l'offerta. E' il punto singolo che oggi rende impossibile
   l'asta libera.
3. **Manca un modo per chiamare.** Il pulsante «Chiama» sta solo dentro la
   propria lista (`TabelloneAsta.tsx:558-572`), e «Prossime chiamate» in regia
   pesca solo da `liste_aste` (`admin/asta/page.tsx:80-131`). Serve una ricerca
   sul listone intero — anche «Chiama per conto di» ne ha bisogno.
4. **La fascia di stato direbbe il falso in cima a ogni pagina:** con
   `squadreAttive` vuoto, `statoLega.ts:278-280` risponde **sempre** «Aste a
   chiamata concluse».
5. **La chiusura anticipata per ritiri sparisce:** `isSoloLeft`
   (`TabelloneAsta.tsx:250-254`, gemello in `statoLega.ts:240-241`) conta i
   contendenti dichiarati, a lista vuota e' sempre falso.

**Trappola isolata da non dimenticare:** `admin_annulla_acquisto`
(`20260802170000_buste_esito_finale.sql:126-133`) reinserisce l'ex vincitore in
`liste_aste` se nessun altro ha il giocatore in lista. In asta libera creerebbe
righe dove non ce n'erano, e da quel momento `squadra_in_gara` diventa
**esclusiva**: sul giocatore riaperto potrebbe rilanciare solo lui. Va
condizionato alla modalita'.

**Cosa invece e' facile:** spegnere le buste costa zero — `fase_buste_aperta` e'
gia' `false` di default e nessuna funzione dell'asta dal vivo dipende dalle
buste (e' il contrario: `admin_elabora_buste` e' l'unico ponte che alimenta
`liste_aste`). E gli import passano da tre a due: `importAste`
(`src/app/admin/actions.ts:383-529`) e' l'unico che popola `liste_aste`.

**Il modello per l'interruttore** e' `fase_mercato_aperta`, non
`fase_buste_aperta`: colonna in `regole_lega` sullo stampo di
`20260807100000_trasferimenti.sql:26-30`, RPC con guardia `is_super_admin()`
sullo stampo di `admin_toggle_mercato`
(`20260808140000_trasferimenti_funzione.sql:103-121`), helper di lettura
condiviso come `trasferimentiAttivi` (`src/utils/trasferimenti.ts:23`), e un
flag `soloSeAstaBuste` nel `type Voce` della NavBar
(`src/components/NavBar.tsx:20-26`) per far sparire `/buste` e
`/sommario-buste`, esattamente come si fa oggi con i trasferimenti.

**Da rigenerare** dopo la migration: `src/utils/supabase/database.types.ts`,
altrimenti il client tipizzato rifiuta la colonna nuova.

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

### «Collegata» vuol dire scheda aperta, non manager presente

Il pallino in *Budget e Fasi* (v1.26) usa Supabase Presence: dice che quel
browser ha il sito aperto. Una scheda dimenticata aperta sul telefono in tasca
risulta collegata, e chi ha chiuso il portatile senza uscire sparisce solo dopo
qualche secondo.

Va bene per la domanda a cui serve — «chi manca all'appello prima di aprire o
chiudere una fase» — e **non va bene** per dedurre chi sta compilando la busta.
Il titolo del pallino lo scrive per esteso proprio per questo.

**Trappola nota, misurata il 2 settembre:** `supabase.channel(topic)` chiamato
due volte **restituisce lo stesso oggetto**, e Realtime rifiuta ascoltatori dopo
`subscribe()`. Per questo il canale sta in `utils/presenza.ts` e non nei
componenti: il primo disegno — un canale nella NavBar che annuncia e uno nella
pagina admin che ascolta — non funziona, ed e' morto in prova.

**Non misurato:** quanti messaggi realtime consuma Presence. Il margine e'
enorme (4.832 su 2.000.000 nel ciclo scorso) ma va guardato dopo la prima
serata d'asta vera, insieme agli altri consumi.

---

## Da fare, deciso il 2 settembre

Chieste il 2 settembre. **Due sono state fatte lo stesso giorno** — l'ordine
per crediti e il filtro per piu' ruoli, vedi *Fatto di recente*. Restano queste,
con il contesto per ripartire senza rifare la ricerca.

### Manca il logo della Premier League

Notato il 5 settembre facendo il filtro per campionato. In `public/loghi/` ci
sono **quattro** loghi di campionato — `bundesliga`, `la-liga`, `ligue-1`,
`serie-a` — e manca `premier-league.png`. Per questo il filtro nuovo e' fatto
di sole scritte: una tendina con l'icona su quattro voci su cinque si legge
come un errore, non come una scelta.

Scaricato quel file, la tendina puo' diventare illustrata in tutte e tre le
pagine. La mappa e i nomi stanno gia' in `src/utils/campionati.ts`.

### Scegliere quali preferiti entrano in busta

Il pulsante *Aggiungi i preferiti* in `/buste` deve aprire una finestra con
l'elenco dei preferiti e una casella per ciascuno, invece di decidere da se'.

**Perche'.** Con piu' preferiti che slot liberi oggi entrano i primi che sono
stati stellati: `scegliDaiPreferiti` (`src/utils/preferiti.ts:80`) li prende in
ordine di `created_at` e taglia con `.slice(0, posti)`. **Non e' casuale, ma
tanto vale**: si stella scorrendo gli svincolati, quindi quell'ordine e' quello
della lista, non del gradimento. Chi ha quindici preferiti per otto slot si
ritrova otto nomi che non ha scelto.

**Cosa deve mostrare la finestra**, oltre alle caselle:

- **costo di quel che si sta scegliendo e budget residuo**, aggiornati mentre si
  spunta. Oggi `scegliDaiPreferiti` non guarda i crediti: si riempie la busta e
  si scopre solo al salvataggio di aver sforato;
- **i portieri**, per lo stesso motivo: `submit_buste` ne pretende esattamente
  quanti ne mancano (`20260829180000_buste_portieri_esatti.sql`), e una busta
  senza il portiere richiesto viene rifiutata a compilazione finita;
- **quanti slot restano**, che e' il numero che dice quando fermarsi;
- **chi non e' piu' disponibile**, che la pagina gia' conta come
  `nonDisponibili`: un preferito stellato una settimana fa puo' essere stato
  preso da un altro, e sparire in silenzio e' cio' che fa credere di averne
  dieci quando sono otto.

**Ordine dell'elenco:** per quotazione decrescente, come tutte le liste da fine
agosto. L'ordine di stellatura non serve piu' a niente appena si sceglie a mano.

**Trappola da non ripetere.** La prima versione del riempimento *sostituiva* la
selezione in corso e chiedeva conferma prima di farlo: era il comportamento
sbagliato con un cerotto sopra, ed e' stato cambiato il 29 agosto. La finestra
deve **aggiungere** a quel che c'e' gia', e le caselle dei giocatori gia'
selezionati vanno mostrate spuntate e bloccate, non nascoste: chi le cerca deve
trovarle.

**Cosa riusare.** `src/components/Conferma.tsx` ha gia' la meccanica giusta —
Esc, clic sullo sfondo, focus all'apertura, `aria-modal` — e accetta
`messaggio: React.ReactNode`. Ma e' larga `max-w-md` ed e' fatta per due
pulsanti: per un elenco scorrevole conviene un componente a parte che
**riprenda quella meccanica** invece di forzarla, come Conferma stessa fece con
la modale dell'hard reset.

`scegliDaiPreferiti` non va buttata: diventa il calcolo che prepara le voci
della finestra — chi e' disponibile, chi gia' dentro, quanti slot restano —
invece di decidere il taglio.

**Da misurare a 360px:** quindici righe, caselle da centrare col dito, e il
riepilogo del costo che non deve finire sotto la piega.

### Gli stemmi esteri sono in uso: come tenerli in piedi

Dal listone del 2 settembre le squadre sono **37** e hanno tutte lo stemma
(`scripts/prova-abbinamento-loghi.mjs`, che legge i nomi **dal database** e non
da un elenco scritto a mano).

**La lezione:** la chiave non e' il nome ufficiale del club, e' **come lo scrive
il listone**. Quello italiano traduce — «Bayern Monaco», «Lipsia», «Stoccarda»,
«Barcellona», «Olympique Marsiglia», «Racing Strasburgo», «Athletic Bilbao»,
«Betis», «Eintracht» — e con le sole chiavi inglesi nove squadre su trentasette
restavano senza. Dove i due nomi divergono ci sono due voci verso lo stesso
file, cosi' regge anche un listone in inglese.

**Al prossimo listone si rilancia quello script prima di guardare le pagine:**
uno stemma mancante non somiglia a un guasto, la riga si disegna lo stesso
senza immagine.

**Se rinomini un file** in `public/loghi/`, la voce di mappa che lo cita va
aggiornata: lo script segnala anche le voci che puntano a file inesistenti, ed
e' cosi' che sono state trovate le sei rinominate a mano.

**Tottenham:** blu notte, luminanza 34 su un fondo a 13, cioe' 2,2:1. Non e'
invertibile — `invert` vale solo sul nero pieno — quindi ha un alone chiaro
(`STEMMI_SCURI` + `.fm-logo-alone`). Il Liverpool, secondo piu' scuro in uso, e'
a 71 (4,2:1) e non serve.

### Trappola permanente: aggiungere un parametro non sostituisce la funzione

Pagata il 2 settembre, e va ricordata perche' **nessuna delle regole che ci
eravamo dati la copriva**.

`CREATE OR REPLACE FUNCTION` con un parametro in piu' non sostituisce la
funzione: ne crea una **seconda**. Dopo il push a database c'erano
`prenota_chiamata(integer)` e `prenota_chiamata(integer, uuid)`, e PostgREST —
ricevendo la chiamata con il solo `p_giocatore_id`, come la fa il sito —
rispondeva «Could not choose the best candidate function». Cioe' **nessun
manager riusciva piu' a chiamare**, che e' l'azione centrale dell'asta.

Trovata provando la firma vecchia subito dopo il push, non da una
segnalazione: senza quella prova sarebbe uscita in faccia al primo manager di
turno, dal vivo.

**La regola:** o si tiene la stessa firma, o si fa il `DROP FUNCTION` esplicito
della vecchia **nella stessa migration**. Copiare il corpo alla lettera non
basta — li' il corpo era giusto, era la firma il problema.

Come verificarlo senza rischi, dopo ogni push che tocca una funzione: chiamarla
con la firma vecchia e guardare che l'errore sia di logica e non
«Could not choose the best candidate».

### Convertire anche /trasferimenti alla scelta multipla dei ruoli

Le altre tre liste usano `SceltaRuoli`; `/trasferimenti` ha ancora la tendina a
scelta singola e `OpzioniRuolo.tsx` esiste solo per lei.

**Non e' una dimenticanza:** il mercato e' chiuso, quella pagina non si puo'
guardare funzionare, e convertirla alla cieca sarebbe l'unico modo di romperla
senza accorgersene. Da fare quando il mercato riapre — allora `OpzioniRuolo.tsx`
puo' sparire. Stessa ragione per cui e' rimandata la pastiglia del reparto la'
dentro.

`passaFiltri` e `ruoloCorrisponde` accettano gia' sia una stringa sia un
elenco, proprio per permettere questa conversione una pagina alla volta.

---

## Da fare, deciso il 4 settembre

Proposte confrontando il sito con un concorrente, discusse e filtrate insieme.
**Tre delle quattro sono state fatte il 5 settembre** — occhiolino, pagina
profilo e sito installabile, vedi *Fatto di recente*. **Le statistiche sono
arrivate lo stesso giorno**, nate da tre domande fatte a voce (media eta',
media crediti, media quotazioni) e diventate `/statistiche`. Resta fuori, non
scartato per sempre, l'upload del logo fantasquadra.

### L'ordine di chiamata durante un'asta viva, solo per l'admin

**Verificato nel codice, non un'impressione:** in
`src/components/TabelloneAsta.tsx:415-421` la barra dell'ordine (chi tocca,
quanti turni mancano) sta dentro `if (!asta)` — appena un'asta e' viva il
componente passa alla vista di rilancio e quella barra sparisce del tutto, per
i manager. L'admin invece non la perde mai: il suo pannello in
`src/app/admin/asta/page.tsx:253` non ha quella condizione, resta sempre
visibile.

Il calcolo (chi manca da chiamare, la propria posizione, quanti turni
mancano — righe 421-435 dello stesso file) e' gia' scritto per il ramo
`!asta`: va reso disponibile anche durante l'asta viva, in forma compatta,
non riscritto da capo.

**Nota di contesto:** `RigaStato` (la fascia sotto la barra, `descriviStato` in
`src/utils/statoLega.ts`) omette di proposito il "poi tocca a…" quando un'asta
e' aperta, per risparmiare una query — commento sul posto: "non c'e' nessuno a
cui interessi il turno successivo adesso". Questa richiesta lo smentisce: puo'
valer la pena rivedere anche quella scelta insieme a questa, non solo il
tabellone.

---

## Da fare, deciso il 5 settembre

### Fatto il 5 settembre — resta da spingere la migration

`20260905120000_giro_completato.sql` e' scritta ma **il codice non va in
produzione prima del `db push`**: la fascia di stato e la Regia leggono
`regole_lega.giro_da_confermare`, che senza la migration non esiste. La query
fallirebbe e la fascia direbbe «Ordine di chiamata da sorteggiare» a tutti.

Dopo il push va anche **rigenerato `src/utils/supabase/database.types.ts`**:
la colonna e `admin_conferma_ordine` sono state aggiunte a mano per far
compilare, e la rigenerazione e' l'unica cosa che dice se combaciano davvero.

---

## Fatto di recente

| Quando | Cosa |
|---|---|
| 5 set 2026 | Finito il giro, il turno si ferma e aspetta l'admin |
| 5 set 2026 | Filtro per campionato in Svincolati, Buste e Sommario Aste |
| 5 set 2026 | L'ordine di chiamata resta visibile anche con un'asta viva |
| 5 set 2026 | Pagina Statistiche: eta', quotazioni e spesa d'asta di ogni squadra |
| 5 set 2026 | Il sito si installa sul telefono, con icone proprie |
| 5 set 2026 | Il profilo ha una pagina sua, dal chip col proprio nome |
| 5 set 2026 | L'occhiolino anche nel cambio password |
| 3 set 2026 | Spinte le migration del 2 settembre e verificate a database |
| 3 set 2026 | Import completo della lega nuova: 14 squadre, 37 squadre con stemma |
| 2 set 2026 | L'admin puo' chiamare per conto di un manager assente |
| 2 set 2026 | L'hard reset azzera anche il contatore dei turni di buste |
| 2 set 2026 | Sommario Buste ha una pagina sua, e /buste una query in meno |
| 2 set 2026 | Il campo di ricerca e' allineato agli altri filtri |
| 2 set 2026 | Filtro per piu' ruoli insieme, con la regola «almeno uno» |
| 2 set 2026 | Svincolati e buste partono dal piu' caro, non dalla A |
| 2 set 2026 | In Budget e Fasi si vede chi e' collegato in questo momento |
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
