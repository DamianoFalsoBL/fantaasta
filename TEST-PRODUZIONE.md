# Piano di test — FantaAsta in produzione

Collaudo completo del sito pubblicato su **https://fantaasta-zeta.vercel.app**.
Copre ogni pagina, ogni bottone e i casi limite di ciascuna funzione.

Il documento più vecchio, [COLLAUDO.md](COLLAUDO.md), resta valido come giro
rapido; **questo lo sostituisce** come riferimento completo.

---

## ⚠️ Leggere prima di toccare qualsiasi cosa

**Il sito in produzione e il sito in locale usano lo stesso database.** C'è un
solo progetto Supabase. Non esiste un ambiente di prova separato: ogni test che
scrive — un'asta, uno spoglio buste, un cambio di ruolo — modifica i dati veri
della lega, e li modifica anche per chi sta lavorando in locale.

Da qui discendono tre regole:

1. **Prima di iniziare, scarica l'export CSV** da `/admin/riepilogo` → *Scarica
   CSV*. È la fotografia delle 14 rose e dei costi pagati. Se un test va storto,
   quel file è l'unico modo per sapere com'era il mondo prima.
2. **I blocchi sono ordinati dal meno al più invasivo.** Non saltare avanti: il
   blocco J cancella il database.
3. **Se la lega sta già usando il sito**, fermati alla fine del blocco C. Tutto
   ciò che viene dopo va fatto in una finestra concordata.

### Cosa serve

| | |
|---|---|
| Browser | due finestre indipendenti — una normale e una in incognito. Servono per i test in tempo reale: due schede della stessa finestra condividono la sessione |
| Account | il **super admin**, un **admin** e almeno **due manager** diversi |
| Dispositivi | un computer e un telefono. Il blocco I è tutto sul telefono |
| Alla mano | l'export CSV di partenza, e il nome di un giocatore ancora libero da usare come cavia |

### Come si accede

Il campo *Username o Email* accetta entrambi. Se scrivi un nome senza `@`, viene
convertito in `nome@fantacalcio.local` togliendo gli spazi e passando a
minuscole: `Mario Rossi` diventa `mariorossi@fantacalcio.local`.

Dopo il login l'app smista in base al ruolo: il **super admin** finisce su
`/admin/setup`, tutti gli altri su `/asta`.

### Come annotare

Ogni test ha un codice (`A1`, `D4`, …). Segna `[x]` se passa. Se fallisce,
scrivi nella tabella in fondo: **codice, cosa ti aspettavi, cosa è successo,
ruolo con cui eri collegato**. Quest'ultimo dato è quello che si dimentica
sempre ed è quasi sempre quello che spiega il problema.

---

## Blocco A — Accessi e permessi

Non scrive nulla. Si può eseguire in qualunque momento, anche a lega in corso.

### A1 · Rotte protette senza sessione
- [ ] In una finestra in incognito, **senza fare login**, apri a mano:
  `/asta`, `/aste`, `/rose`, `/svincolati`, `/storico`, `/buste`,
  `/admin/asta`, `/admin/riepilogo`, `/admin/setup`, `/debug`.

  **Atteso:** ognuna ti riporta alla home con il form di accesso. Nessuna deve
  mostrare, nemmeno per un istante, nomi di squadre, budget o pulsanti admin.

### A2 · Endpoint di ripristino disattivato
- [ ] Apri `/api/magic?email=superadmin@fantacalcio.local`.

  **Atteso:** `404` con `{"error":"Endpoint disattivato: MAGIC_RECOVERY_TOKEN non configurato."}`.
  Se risponde qualcosa di diverso, fermati: significa che su Vercel è stata
  configurata quella variabile, e va rimossa.

### A3 · Export riservato
- [ ] Sempre da sloggato, apri `/api/export/rose`.

  **Atteso:** `401` con `{"error":"Non autenticato."}`. Nessun file scaricato.

### A4 · Login sbagliato
- [ ] Username giusto, password sbagliata.
  **Atteso:** messaggio d'errore rosso dentro il riquadro *Accedi*, si resta
  sulla pagina.
- [ ] Username inesistente.
  **Atteso:** stesso comportamento, nessuna pagina bianca.
- [ ] Campi vuoti → *Entra nell'asta*.
  **Atteso:** il browser blocca l'invio (i campi sono obbligatori).

### A5 · Login manager
- [ ] Entra come manager.
  **Atteso:** atterri su `/asta`. La barra in alto mostra il nome della tua
  squadra, i crediti residui e gli slot. **Non** compare il menu
  *Amministrazione*.

### A6 · Login admin
- [ ] Entra come admin.
  **Atteso:** atterri su `/asta`. Compare il menu *Amministrazione* con
  **due** voci: *Regia Asta Live* e *Riepilogo e Budget*. **Non** c'è *Setup
  Sistema*.

### A7 · Login super admin
- [ ] Entra come super admin.
  **Atteso:** atterri su `/admin/setup`. Nella barra compare 👑. Il menu
  *Amministrazione* ha **tre** voci, *Setup Sistema* inclusa.

### A8 · Il super admin non entra in asta
- [ ] Da super admin, apri `/asta` a mano.
  **Atteso:** vieni rimandato a `/admin/setup`. Il super admin non ha una
  squadra e non deve poter partecipare.

### A9 · Il manager non entra nell'area admin
- [ ] Da manager, apri a mano `/admin/asta`, `/admin/riepilogo`, `/admin/setup`
  e `/debug`.
  **Atteso:** tutte rimandano a `/asta`. Nessun contenuto riservato.

### A10 · L'admin non entra nel setup
- [ ] Da admin (non super), apri `/admin/setup`.
  **Atteso:** rimandato a `/asta`. Import ed hard reset sono solo del super admin.

### A11 · Persistenza della sessione
- [ ] Da loggato, ricarica con F5. Poi chiudi la scheda e riaprila.
  **Atteso:** resti dentro. È il test che vale solo in produzione: su HTTPS i
  cookie hanno regole diverse che su `localhost`.

### A12 · Uscita
- [ ] Premi *Esci*.
  **Atteso:** torni alla home. Premi il tasto "indietro" del browser: **non**
  devi rientrare in una pagina riservata.

---

## Blocco B — Navigazione e interfaccia

Non scrive nulla.

### B1 · Tutte le voci di menu
- [ ] Da manager, apri una per una le sei voci: *Tabellone Live*, *Aste a
  Chiamata*, *Tutte le Rose*, *Lista Svincolati*, *Storico Aste*,
  *Buste Riparazione*.
  **Atteso:** ogni pagina carica, la voce attiva è evidenziata, nessuna pagina
  di errore.
- [ ] Da admin, aggiungi *Regia Asta Live* e *Riepilogo e Budget*.
- [ ] Da super admin, aggiungi *Setup Sistema*.

### B2 · Metriche di budget sempre visibili
- [ ] Guarda la barra in alto da manager, su computer e su telefono.
  **Atteso:** crediti residui e slot si leggono in entrambi i casi. Durante
  un'asta il budget residuo è il dato più importante dello schermo e non deve
  mai sparire.
- [ ] Se una squadra ha extra budget negativo, controlla che il numero si legga
  col segno meno e non venga tagliato.

### B3 · Rotta morta
- [ ] Apri `/login`.
  **Atteso:** una pagina coerente col tema scuro. Non è la pagina di accesso
  vera (quella è la home) ma non deve essere rotta né mezza bianca.

### B4 · Pagina inesistente
- [ ] Apri `/qualcosa-che-non-esiste`.
  **Atteso:** pagina 404, con lo stesso tema del resto.

### B5 · Nessun errore in console
- [ ] Su ogni pagina, apri gli strumenti da sviluppatore → *Console*.
  **Atteso:** nessun messaggio rosso. Gli avvisi gialli si possono ignorare.

---

## Blocco C — Lettura dei dati

Non scrive nulla. È qui che si verifica che la produzione veda gli stessi
numeri del database.

### C1 · Tutte le rose
- [ ] `/rose`: conta le squadre.
  **Atteso:** 14 schede. Per ciascuna: crediti, slot occupati su totali, spesa.
  I badge di ruolo Mantra hanno colori coerenti (P arancio, D verde, C blu,
  W/T viola, A rosso).
- [ ] Somma a campione: per una squadra, i crediti residui più la spesa devono
  tornare col budget iniziale mostrato in `/admin/riepilogo`.

### C2 · Svincolati e filtri
- [ ] `/svincolati`: la lista carica.
- [ ] Scrivi tre lettere nel campo di ricerca → la lista si restringe.
- [ ] Filtra per squadra reale → restano solo i suoi giocatori.
- [ ] Filtra per ruolo → funziona sia sul ruolo classico sia sui ruoli Mantra.
- [ ] Filtra per età.
- [ ] **Combina due filtri insieme** → devono valere entrambi, non l'ultimo.
- [ ] Svuota tutti i filtri → la lista torna completa.
- [ ] Cerca una stringa senza risultati → messaggio di lista vuota, non tabella
  spezzata.

### C3 · Aste a chiamata
- [ ] `/aste`: le quattro tessere in cima (i totali) mostrano numeri sensati.
- [ ] Spunta *solo contesi* → restano i giocatori richiesti da più squadre.
- [ ] Spunta *solo le mie* → restano quelli nella tua lista.
- [ ] Spunta entrambe → valgono entrambe.
- [ ] Usa i due menu a tendina di filtro.

### C4 · Storico
- [ ] `/storico`: le aste concluse sono in ordine dalla più recente.
  **Atteso:** cinque colonne leggibili, date in formato italiano.

### C5 · Riepilogo admin
- [ ] `/admin/riepilogo` da admin.
  **Atteso:** 14 squadre con budget iniziale, residuo, slot. La tabella
  *Ultimi 20 acquisti* mostra gli ultimi acquisti dal più recente.

### C6 · Slot per squadra
- [ ] `/debug` da admin.
  **Atteso:** l'elenco delle squadre con slot occupati su totali. I numeri
  devono coincidere con quelli di `/rose` e `/admin/riepilogo`. **Se non
  coincidono**, è il caso d'uso del bottone *Ricalcola slot occupati* (test G3).

---

## Blocco D — Asta live

**Da qui in poi si scrive sul database.** Ogni acquisto è però annullabile
(test D14), quindi il blocco è reversibile se lo si porta a termine.

Serve un giocatore libero che compaia in *Prossime chiamate*, e due manager in
due finestre separate. Chiamiamoli **M1** e **M2**.

### D1 · Sorteggio dell'ordine
- [ ] Admin su `/admin/asta` → *Sorteggia nuovo ordine*.
  **Atteso:** compare la fila delle squadre numerata; la squadra di turno è
  evidenziata.
- [ ] **Senza ricaricare**, guarda la finestra di M1 su `/asta`: la barra
  dell'ordine deve aggiornarsi da sola. È il primo test del tempo reale.

### D2 · Barra ordine dal lato manager
- [ ] Su `/asta`, la barra mostra solo chi deve ancora chiamare, con
  l'indicazione di quante squadre hanno già completato.
- [ ] La tua squadra è riconoscibile fra le altre.

### D3 · Chiamata da chi è di turno
- [ ] Da M1, se è il suo turno, scegli un giocatore dalla sua lista e chiama.
  **Atteso:** l'asta compare da entrambi i lati e in Regia, in stato *prenotata,
  in attesa di avvio*. Chi ha chiamato è già in testa al prezzo base.

### D4 · Chiamata da chi non è di turno
- [ ] Da M2 (non di turno), prova a chiamare.
  **Atteso:** rifiutato, con un messaggio comprensibile.

### D5 · Avvio del timer
- [ ] Admin → *Avvia timer*.
  **Atteso:** il conto alla rovescia parte da entrambi i lati e **scorre
  fluido**, senza scatti né ripartenze. Il numero cambia colore mentre pulsa;
  deve restare leggibile in ogni istante.

### D6 · Rilancio +1
- [ ] Da M2 → *+1*.
  **Atteso:** prezzo e squadra in testa si aggiornano su **tutti** gli schermi
  senza ricaricare. Il timer riparte.

### D7 · Rilancio +5
- [ ] Da M1 → *+5*. Stesso comportamento.

### D8 · Offerta libera
- [ ] Scrivi un importo nel campo e premi *Vai*.
  **Atteso:** accettato se è sopra il minimo indicato.
- [ ] Prova un importo **sotto** il minimo.
  **Atteso:** rifiutato, con i numeri corretti nel messaggio.
- [ ] Se nessuno ha ancora offerto, il primo bottone deve dire **Base N** e non
  *+1*: comprare al prezzo base deve essere possibile.

### D9 · Oltre il massimo offribile
- [ ] Offri una cifra superiore al tuo massimo (il budget meno quanto serve a
  riempire gli slot restanti).
  **Atteso:** rifiutato, e il messaggio mostra **il numero esatto** del tuo
  massimo, non una frase generica.

### D10 · Chi è in testa non rilancia contro sé stesso
- [ ] Da chi è già in testa, guarda i bottoni di rilancio.
  **Atteso:** disattivati, con scritto *Sei già in testa*.

### D11 · Ritiro
- [ ] Da un manager **non** in testa → *Smetti (mi ritiro)*.
  **Atteso:** la sua targhetta fra i partecipanti diventa barrata con ❌, e
  resta **leggibile** (non deve sbiadire fino a sparire). I suoi comandi si
  disattivano.
- [ ] Da chi **è** in testa, prova a ritirarti.
  **Atteso:** rifiutato.

### D12 · Rosa piena
- [ ] Con una squadra a 30/30, prova a rilanciare.
  **Atteso:** comandi disattivati con *La tua rosa è al completo*.

### D13 · Chiusura e assegnazione
- [ ] Admin → *Chiudi asta e assegna*.
  **Atteso, tutto insieme:** il giocatore entra nella rosa del vincitore, i
  crediti calano dell'importo esatto, gli slot salgono di uno, il turno di
  chiamata avanza, l'asta compare in `/storico`.
- [ ] Verifica i numeri in `/admin/riepilogo` **e** in `/rose`: devono
  coincidere fra loro.

### D14 · Annullamento dell'acquisto
- [ ] `/admin/riepilogo` → sulla riga dell'acquisto appena fatto → *Annulla
  acquisto* → conferma nella finestra rossa.
  **Atteso:** crediti restituiti per l'importo esatto, slot -1, giocatore di
  nuovo libero, riga sparita dagli ultimi acquisti, e il giocatore **torna in
  Prossime chiamate con i suoi contendenti originali**.

### D15 · Avvio d'ufficio dall'admin
- [ ] Senza che nessuno abbia chiamato, avvia un'asta dalla Regia.
  **Atteso:** il giocatore risulta **già assegnato al prezzo base** alla prima
  squadra dell'ordine di chiamata che lo ha in lista, può permetterselo e non ha
  la rosa piena. Serve a evitare che un giocatore resti nel limbo se nessuno
  offre.
- [ ] Se nessuna squadra lo ha in lista, l'asta parte senza nessuno in testa: è
  corretto.

### D16 · Asta andata deserta
- [ ] Avvia un'asta su un giocatore che nessuno ha in lista e chiudila senza
  offerte.
  **Atteso:** il giocatore resta libero e ricompare in *Prossime chiamate*, ma
  con la targhetta **già andata deserta**, per distinguerlo da chi non è mai
  stato chiamato.

### D17 · Doppia asta contemporanea
- [ ] Con un'asta in corso, prova ad avviarne un'altra dalla Regia.
  **Atteso:** i bottoni *Avvia asta* sono disattivati. Si lavora un giocatore
  per volta.

### D18 · Tenuta del tempo reale dopo una pausa

**Cosa si sta provando.** L'asta si aggiorna da sola perché ogni pagina tiene
una connessione permanente aperta verso Supabase. Quella connessione può cadere
senza avvisare: schermo del telefono spento, computer che va in sospensione,
passaggio dal wi-fi alla rete dati. Se cade e non si riaggancia, la pagina
continua a mostrare l'ultimo prezzo che ha ricevuto — **senza nessun segnale che
è vecchio**. È il guasto peggiore che possa capitare in un'asta dal vivo:
qualcuno rilancia guardando un numero che non è più quello vero.

C'è una rete di sicurezza: ogni **15 secondi** la pagina richiede comunque lo
stato dell'asta. Serve proprio a coprire questo caso.

**Come si prova.** Due finestre sulla stessa asta. Lascia la prima **ferma e in
secondo piano per cinque minuti** — se è un telefono, spegni lo schermo. Poi,
dalla seconda, fai un rilancio. Torna sulla prima **senza ricaricarla**.

- [ ] **Si aggiorna entro un secondo** → tutto a posto, la connessione ha retto.
- [ ] **Si aggiorna dopo qualche secondo, entro quindici** → la connessione era
  caduta ma la rete di sicurezza ha funzionato. Utilizzabile, ma **annotalo**.
- [ ] **Non si aggiorna affatto** → guasto vero. Annota per quanto tempo era
  rimasta ferma, se era telefono o computer, e se la rete era cambiata.

Il secondo caso è quello da tenere d'occhio: in un'asta con timer da 10 secondi,
un ritardo fino a 15 significa vedere il prezzo giusto quando l'asta è già finita.

---

## Blocco E — Modalità delega

Serve quando un manager è assente e l'admin offre per lui. Visibile solo
all'admin, durante un'asta avviata.

### E1 · Comparsa del pannello
- [ ] Da admin, durante un'asta in corso, scorri in fondo al tabellone.
  **Atteso:** il pannello ambra *Modalità delega (assenti)* con la tendina delle
  squadre.

### E2 · Selezione della squadra
- [ ] Scegli una squadra dalla tendina.
  **Atteso:** compaiono i suoi comandi di rilancio, e il suo massimo offribile.

### E3 · Rilancio per conto terzi
- [ ] Usa *+1* e *+5* dal pannello delega.
  **Atteso:** il rilancio risulta a nome della squadra delegata, non
  dell'admin, e si vede su tutti gli schermi.

### E4 · Ritiro per conto terzi
- [ ] Ritira la squadra delegata.
  **Atteso:** risulta ritirata come se l'avesse fatto lei.

### E5 · Limiti anche in delega
- [ ] Prova a superare il massimo offribile della squadra delegata.
  **Atteso:** rifiutato. La delega non aggira le regole.

### E6 · Delega su chi è già in testa
- [ ] Seleziona la squadra che è in testa.
  **Atteso:** i comandi sono disattivati.

---

## Blocco F — Buste di riparazione

**Semi-distruttivo:** lo spoglio tessera i giocatori. Da fare solo se il mercato
di riparazione è davvero in programma, o su giocatori che si è disposti a
riassegnare.

### F1 · Fase chiusa
- [ ] Da manager, `/buste` con fase chiusa.
  **Atteso:** avviso che la fase è chiusa, nessun modo di selezionare.

### F2 · Apertura
- [ ] Admin su `/admin/riepilogo` → *Apri fase buste* → conferma.
  **Atteso:** lo stato passa ad *Aperta*, e la pagina `/buste` del manager **si
  sblocca da sola, senza ricaricare**.

### F3 · Selezione
- [ ] Da manager, cerca e seleziona giocatori.
  **Atteso:** contatore dei selezionati e costo totale si aggiornano a ogni
  scelta.
- [ ] Deseleziona → i numeri tornano indietro.
- [ ] Usa la ricerca e il filtro per ruolo dentro la pagina.

### F4 · Numero sbagliato di slot
- [ ] Seleziona **meno** giocatori degli slot liberi e invia.
  **Atteso:** rifiutato, con il numero esatto richiesto.
- [ ] Seleziona **più** giocatori degli slot liberi.
  **Atteso:** rifiutato allo stesso modo.

### F5 · Budget superato
- [ ] Seleziona il numero giusto ma per un costo oltre i tuoi crediti.
  **Atteso:** rifiutato, con costo e budget nel messaggio.

### F6 · Invio valido
- [ ] Numero esatto, entro budget → invia.
  **Atteso:** conferma di salvataggio.

### F7 · Riservatezza
- [ ] Da un secondo manager, guarda `/buste`.
  **Atteso:** vede **solo** le proprie selezioni. Mai quelle altrui: è un'asta
  al buio.

### F8 · Chiusura
- [ ] Admin → *Chiudi fase buste*.
  **Atteso:** i manager non possono più modificare.

### F9 · Spoglio a fase ancora aperta
- [ ] Con la fase **aperta**, premi *Elabora buste*.
  **Atteso:** rifiutato con *Devi prima chiudere la fase buste*.

### F10 · Spoglio
- [ ] A fase chiusa → *Elabora buste* → conferma.
  **Atteso:** chi era solo su un giocatore lo ottiene subito; i contesi
  finiscono allo spareggio. Crediti e slot si aggiornano.

### F11 · Esiti dal lato manager
- [ ] Da manager, `/buste`.
  **Atteso:** i propri esiti — vinto, perso, conteso — e nient'altro.

### F12 · Ballottaggio
- [ ] Risolvi un conteso assegnandolo a una squadra.
  **Atteso:** quella lo tessera al prezzo di quotazione, le altre risultano
  perdenti.
- [ ] Prova ad assegnarlo a una squadra con la rosa piena.
  **Atteso:** rifiutato.

### F13 · Secondo turno
- [ ] Riapri la fase buste dopo uno spoglio.
  **Atteso:** si apre un **turno nuovo**; gli esiti del turno precedente
  restano consultabili e non vengono confusi con i nuovi.

---

## Blocco G — Manutenzione admin

### G1 · Aggiunta crediti
- [ ] `/admin/riepilogo`, su una squadra, imposta 5 e premi **+**.
  **Atteso:** finestra di conferma, poi il budget sale di 5.

### G2 · Rimozione crediti
- [ ] Sulla stessa squadra, premi **−** con lo stesso importo.
  **Atteso:** il budget torna al valore di partenza. **Rimettilo com'era prima
  di proseguire.**
- [ ] Prova a togliere più crediti di quanti ne abbia.
  **Atteso:** o viene rifiutato, o il residuo va sotto zero in modo visibile —
  **annota quale dei due**, perché cambia come si gestisce l'errore.

### G3 · Ricalcolo degli slot
- [ ] `/admin/setup` → *Ricalcola slot occupati*.
  **Atteso:** messaggio di completamento, e i numeri di `/debug` coincidono con
  i giocatori realmente tesserati.

### G4 · Promozione e retrocessione
- [ ] `/admin/setup` → *Rendi admin* su una squadra.
  **Atteso:** la targhetta passa a `ADMIN` senza errori.
- [ ] Fai login con quell'utente: deve vedere il menu *Amministrazione*.
- [ ] Riportalo a manager con *Rendi manager*. **Verifica che il menu sparisca.**

### G5 · Il super admin non è nell'elenco
- [ ] Guarda la tabella utenti in `/admin/setup`.
  **Atteso:** il profilo super admin **non** compare. Non deve essere
  retrocedibile da interfaccia.

---

## Blocco H — Export

### H1 · Download con intestazione
- [ ] `/admin/riepilogo` → *Scarica CSV*.
  **Atteso:** scarica un file chiamato `rose-2026-08-04_20-09-43.csv`, con data
  **e ora italiana**. Due export nello stesso giorno devono avere nomi diversi.

### H2 · Contenuto
- [ ] Apri il file.
  **Atteso:** prima riga `id,fantasquadra,costo`, poi una riga per giocatore
  tesserato, ordinate per squadra. Il numero di righe corrisponde ai
  tesseramenti (a rose complete: 420 più l'intestazione).

### H3 · Senza intestazione
- [ ] Usa il link *senza intestazione*.
  **Atteso:** stesso file senza la prima riga.

### H4 · Accenti
- [ ] Apri il CSV **con Excel**.
  **Atteso:** i nomi con accenti e apostrofi si leggono correttamente. È ciò
  che il file garantisce con una marcatura iniziale apposta: se vedi `Ã¨` al
  posto di `è`, segnalalo.

### H5 · Virgole nei nomi
- [ ] Se una fantasquadra ha una virgola nel nome, controlla che in Excel resti
  in una sola colonna.

---

## Blocco I — Telefono

Tutto questo blocco si fa **dal telefono**, non ridimensionando la finestra del
computer. Sono cose che si rompono solo su un dispositivo vero.

### I1 · Menu
- [ ] Il menu a panino apre e chiude.
- [ ] Toccando una voce si naviga **e il menu si chiude da solo**.
- [ ] Le voci admin compaiono solo a chi di dovere.

### I2 · Nessuno scorrimento laterale
- [ ] Su ogni pagina, prova a trascinare in orizzontale.
  **Atteso:** la pagina non si sposta. Le tabelle larghe scorrono **dentro il
  loro riquadro**, non trascinano tutto lo schermo.

### I3 · Tabelle
- [ ] `/storico`, `/svincolati`, `/aste`: le righe si leggono come schede
  impilate, ogni valore con la sua etichetta.
- [ ] `/admin/riepilogo` e `/admin/setup`: scorrono in orizzontale con la prima
  colonna che resta ferma.

### I4 · Asta live sul telefono
- [ ] Durante un'asta: timer e prezzo si leggono, i bottoni di rilancio si
  toccano senza sbagliare mira, la barra dell'ordine scorre su una riga sola.

### I5 · Niente zoom involontario
- [ ] Tocca il campo dell'offerta libera.
  **Atteso:** su iPhone la pagina **non** deve ingrandirsi da sola.

### I6 · Buste
- [ ] `/buste`: la lista dei giocatori scorre dentro il suo riquadro e non
  occupa più dell'altezza dello schermo.

### I7 · Rotazione
- [ ] Ruota il telefono in orizzontale su due o tre pagine.
  **Atteso:** niente si sovrappone.

---

## Blocco J — Distruttivi

> **Solo a fine stagione, o su una lega che si è disposti a ricostruire da
> zero.** Non eseguire mai questo blocco se la lega sta usando il sito.

### J1 · Import utenti e budget
- [ ] `/admin/setup` → *Utenti & Budget* → carica `budget.xlsx`.
  **Atteso:** account e squadre creati, con l'elenco di eventuali righe scartate.
- [ ] Carica un file **con una colonna mancante**.
  **Atteso:** errore comprensibile che dice cosa manca, non una schermata rotta.
- [ ] Carica un file **non Excel**.
  **Atteso:** rifiutato con un messaggio, non un errore del server.

### J2 · Import listone
- [ ] Carica il listone Mantra.
  **Atteso:** **1014 giocatori, 420 tesseramenti**. Se compaiono avvisi su
  fantasquadre non trovate, annota i nomi: non coincidono con quelli in anagrafica.
- [ ] Ricarica **lo stesso file due volte**.
  **Atteso:** non si creano doppioni.

### J3 · Import liste aste
- [ ] Carica il file delle liste a chiamata.
  **Atteso:** sostituisce le liste esistenti; i contendenti compaiono in Regia.

### J4 · Controlli dopo l'import
- [ ] `/rose`: 14 squadre a 30/30.
- [ ] `/svincolati`: **455** giocatori.
- [ ] Un giocatore noto mostra i ruoli Mantra e l'età giusti.

### J5 · Hard reset
- [ ] `/admin/setup` → *Hard reset lega*.
  **Atteso:** la finestra rossa chiede di scrivere `CONFERMO`; il bottone di
  esecuzione resta **disattivato** finché non è scritto esattamente così.
- [ ] Scrivi qualcosa di diverso → resta disattivato.
- [ ] Premi *Annulla* → non succede nulla.
- [ ] Scrivi `CONFERMO` ed esegui.
  **Atteso:** squadre, giocatori e aste cancellati.

### J6 · La prova del nove
- [ ] Dopo il reset, esci e rientra come super admin.
  **Atteso:** **il ruolo è ancora SUPER_ADMIN.** È esattamente il punto che si
  rompeva e che aveva richiesto sei script di ripristino.

---

## Cose già note, da non segnalare come nuove

| Cosa | Stato |
|---|---|
| `/buste` mostra ancora finestre di sistema del browser al posto delle finestre in tema (4 punti: numero slot sbagliato, budget superato, errore di salvataggio, conferma di invio) | Da sistemare. Le altre schermate sono già state convertite |
| I secondi del contatore non sono modificabili da interfaccia | Già in lavorazione — vedi attività *Timer asta configurabile* |
| `npm audit` segnala 5 vulnerabilità nella libreria che legge gli Excel | Preesistenti. L'upload è riservato al super admin, quindi il rischio è basso ma non nullo |
| Le emoji nei menu e nei pulsanti | Da sostituire con il nuovo marchio |

---

## Registro degli esiti

| Codice | Cosa ti aspettavi | Cosa è successo | Ruolo | Dispositivo |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

**Se qualcosa non torna:**

- errori del database → Supabase, *Logs → Postgres*;
- errori dell'applicazione → console del browser, e su Vercel *Deployments →
  Runtime Logs*;
- contatori slot disallineati → `/admin/setup` → *Ricalcola slot occupati*.
