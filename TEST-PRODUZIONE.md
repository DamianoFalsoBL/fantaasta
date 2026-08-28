# Piano di test — FantaAsta in produzione

Collaudo completo del sito pubblicato su **https://asta.damianofalso.com**.
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


### Stato del collaudo

Aggiornato all'8 agosto 2026, sulla produzione.

| Blocco | Esito |
|---|---|
| A — Accessi e permessi | superato, tranne A6 e A7: i menu sono stati rinominati |
| B — Navigazione e interfaccia | superato, tranne B1: voci nuove da riaprire |
| C — Lettura dei dati | superato, tranne C4/C5/C6: Storico e Controllo Slot sono stati assorbiti in altre pagine |
| D — Asta live | superati D14 (annullamento) e D18 (tempo reale); il resto da fare |
| E — Modalità delega | superato |
| F — Buste | da fare |
| G — Manutenzione admin | da fare |
| H — Export | da fare |
| I — Telefono | da fare |
| J — Distruttivi | da fare, solo a fine stagione |
| K — Mercato trasferimenti | da fare, funzione nuova mai provata |

Nessun test fallito finora.

**Giro completo in programma**: domenica, in due, su tutti i blocchi. Le caselle
qui sotto restano quelle effettivamente verificate finora — i blocchi D (dal
rilancio in poi), F, G, H e I sono ancora da percorrere, e vanno spuntati solo
dopo averli eseguiti davvero.

---

## Blocco A — Accessi e permessi

Non scrive nulla. Si può eseguire in qualunque momento, anche a lega in corso.

### A1 · Rotte protette senza sessione
- [x] In una finestra in incognito, **senza fare login**, apri a mano:
  `/asta`, `/aste`, `/rose`, `/svincolati`, `/storico`, `/buste`,
  `/admin/asta`, `/admin/riepilogo`, `/admin/setup`, `/debug`.

  **Atteso:** ognuna ti riporta alla home con il form di accesso. Nessuna deve
  mostrare, nemmeno per un istante, nomi di squadre, budget o pulsanti admin.

### A2 · Endpoint di ripristino disattivato
- [x] Apri `/api/magic?email=superadmin@fantacalcio.local`.

  **Atteso:** `404` con `{"error":"Endpoint disattivato: MAGIC_RECOVERY_TOKEN non configurato."}`.
  Se risponde qualcosa di diverso, fermati: significa che su Vercel è stata
  configurata quella variabile, e va rimossa.

### A3 · Export riservato
- [x] Sempre da sloggato, apri `/api/export/rose`.

  **Atteso:** `401` con `{"error":"Non autenticato."}`. Nessun file scaricato.

### A4 · Login sbagliato
- [x] Username giusto, password sbagliata.
  **Atteso:** messaggio d'errore rosso dentro il riquadro *Accedi*, si resta
  sulla pagina.
- [x] Username inesistente.
  **Atteso:** stesso comportamento, nessuna pagina bianca.
- [x] Campi vuoti → *Entra nell'asta*.
  **Atteso:** il browser blocca l'invio (i campi sono obbligatori).

### A5 · Login manager
- [x] Entra come manager.
  **Atteso:** atterri su `/asta`. La barra in alto mostra il nome della tua
  squadra, i crediti residui e gli slot. **Non** compare il menu *Admin*.

### A6 · Login admin
- [ ] Entra come admin.
  **Atteso:** atterri su `/asta`. Compare il menu *Admin* con **tre** voci:
  *Regia Aste*, *Ratifica Scambi* e *Budget e Fasi*. **Non** c'è
  *Impostazioni*.

### A7 · Login super admin
- [ ] Entra come super admin.
  **Atteso:** atterri su `/admin/setup`. Nella barra compare 👑. Il menu
  *Admin* ha **quattro** voci, *Impostazioni* inclusa. Il menu *Manager* non
  c'è per niente: il super admin non ha una squadra.

### A8 · Il super admin non entra in asta
- [x] Da super admin, apri `/asta` a mano.
  **Atteso:** vieni rimandato a `/admin/setup`. Il super admin non ha una
  squadra e non deve poter partecipare.

### A9 · Il manager non entra nell'area admin
- [x] Da manager, apri a mano `/admin/asta`, `/admin/riepilogo`, `/admin/setup`
  e `/debug`.
  **Atteso:** tutte rimandano a `/asta`. Nessun contenuto riservato.

### A10 · L'admin non entra nel setup
- [x] Da admin (non super), apri `/admin/setup`.
  **Atteso:** rimandato a `/asta`. Import ed hard reset sono solo del super admin.

### A11 · Persistenza della sessione
- [x] Da loggato, ricarica con F5. Poi chiudi la scheda e riaprila.
  **Atteso:** resti dentro. È il test che vale solo in produzione: su HTTPS i
  cookie hanno regole diverse che su `localhost`.

### A12 · Uscita
- [x] Premi *Esci*.
  **Atteso:** torni alla home. Premi il tasto "indietro" del browser: **non**
  devi rientrare in una pagina riservata.

---

## Blocco B — Navigazione e interfaccia

Non scrive nulla.

### B1 · Tutte le voci di menu
- [ ] Da manager, apri una per una le sette voci: *Asta Live*, *Sommario Aste*,
  *Svincolati*, *Tutte le Rose*, *La mia Rosa*, *Lista Trasferimenti*, *Buste*.
  Da admin, le quattro voci: *Impostazioni* (solo super), *Regia Aste*,
  *Ratifica Scambi*, *Budget e Fasi*.
  **Atteso:** ogni pagina carica, la voce attiva è evidenziata, nessuna pagina
  di errore.
- [ ] Nessuna voce si chiama più *Storico Aste* o *Controllo Slot*: sono
  diventate schede e colonne dentro altre pagine.

### B2 · Metriche di budget sempre visibili
- [x] Guarda la barra in alto da manager, su computer e su telefono.
  **Atteso:** crediti residui e slot si leggono in entrambi i casi. Durante
  un'asta il budget residuo è il dato più importante dello schermo e non deve
  mai sparire.
- [x] Se una squadra ha extra budget negativo, controlla che il numero si legga
  col segno meno e non venga tagliato.

### B3 · Rotta morta
- [x] Apri `/login`.
  **Atteso:** una pagina coerente col tema scuro. Non è la pagina di accesso
  vera (quella è la home) ma non deve essere rotta né mezza bianca.

### B4 · Pagina inesistente
- [x] Apri `/qualcosa-che-non-esiste`.
  **Atteso:** pagina 404, con lo stesso tema del resto.

### B5 · Nessun errore in console
- [x] Su ogni pagina, apri gli strumenti da sviluppatore → *Console*.
  **Atteso:** nessun messaggio rosso. Gli avvisi gialli si possono ignorare.

---

## Blocco C — Lettura dei dati

Non scrive nulla. È qui che si verifica che la produzione veda gli stessi
numeri del database.

### C1 · Tutte le rose
- [x] `/rose`: conta le squadre.
  **Atteso:** 14 schede. Per ciascuna: crediti, slot occupati su totali, spesa.
  I badge di ruolo Mantra hanno colori coerenti (P arancio, D verde, C blu,
  W/T viola, A rosso).
- [x] Somma a campione: per una squadra, i crediti residui più la spesa devono
  tornare col budget iniziale mostrato in `/admin/riepilogo`.

### C2 · Svincolati e filtri
- [x] `/svincolati`: la lista carica.
- [x] Scrivi tre lettere nel campo di ricerca → la lista si restringe.
- [x] Filtra per squadra reale → restano solo i suoi giocatori.
- [x] Filtra per ruolo → funziona sia sul ruolo classico sia sui ruoli Mantra.
- [x] Filtra per età.
- [x] **Combina due filtri insieme** → devono valere entrambi, non l'ultimo.
- [x] Svuota tutti i filtri → la lista torna completa.
- [x] Cerca una stringa senza risultati → messaggio di lista vuota, non tabella
  spezzata.
- [ ] **Ordinamento (nuovo).** Tocca l'intestazione *Quotazione*: la lista si
  ordina dal più caro, e la freccia lo indica. Toccala di nuovo: si inverte.
- [ ] Ordina per *Nome*, poi per *Squadra*, poi per *Età*.
  **Atteso:** chi non ha l'età resta **in fondo** in entrambi i versi, non in
  cima.
- [ ] Ordina per *Ruoli*: l'ordine è portieri, difensori, centrocampisti,
  attaccanti — non alfabetico.
- [ ] Applica un filtro **e** un ordinamento: devono valere insieme.
- [ ] **Da telefono**, dove la tabella diventa una pila di schede: c'è la
  tendina *Ordina per* e funziona. Senza quella, sul telefono l'ordinamento non
  esisterebbe, perché le intestazioni sono nascoste.

### C2b · Gli svincolati non contengono chi è già in coda per l'asta
- [ ] Con almeno un giocatore conteso in attesa d'asta (`/aste` → *Da
  assegnare*), cercalo in `/svincolati`.
  **Atteso:** **non compare**. Prima compariva in tutt'e due i posti, perché un
  conteso resta 'LIBERO' finché la sua asta non chiude: chi sfogliava gli
  svincolati per preparare la tornata di buste lo credeva disponibile.
- [ ] Il contatore in alto a destra conta solo i disponibili veri: deve
  scendere esattamente del numero di giocatori elencati in *Da assegnare*.
- [ ] **Il controllo di non aver sconfinato:** `/aste` deve mostrare ancora
  quei giocatori sotto *Da assegnare*, con gli stessi contendenti, e
  `/admin/asta` deve mostrarli ancora fra le prossime chiamate. Se uno di
  questi due elenchi si accorcia, la modifica ha colpito il posto sbagliato.

### C3 · Aste a chiamata
- [ ] **Cambiato: erano quattro tessere, ora due.** `/aste` mostra in cima solo
  *Giocatori in lista* e *Contesi*. Sono spariti *Non contesi*, che in questa
  lista è uno zero fisso — `admin_elabora_buste` ci manda solo chi ha più di
  una richiesta — e *Valore base mostrato*, che nessuno usava per decidere.
  Sul telefono la stessa cosa è una riga sola: «24 in lista · 24 contesi».
- [ ] Se dall'import del file aste arriva un giocatore chiesto da una sola
  squadra, la sua riga deve comunque dirlo con la pastiglia **Solo <squadra>**:
  l'informazione non è andata persa, ha solo smesso di avere un riquadro.
- [x] Spunta *solo contesi* → restano i giocatori richiesti da più squadre.
- [x] Spunta *solo le mie* → restano quelli nella tua lista.
- [x] Spunta entrambe → valgono entrambe.
- [x] Usa i due menu a tendina di filtro.

### C4 · Assegnati (era la pagina Storico)
- [ ] `/aste`, scheda **Assegnati**: le aste concluse sono in ordine dalla più
  recente. Cinque colonne leggibili, date in formato italiano.
- [ ] Le due tessere in cima dicono quante assegnazioni e quanto è stato speso.
- [ ] Torna alla scheda **Da assegnare** e poi di nuovo su Assegnati.
  **Atteso:** il passaggio è immediato, senza ricaricare: i dati arrivano già
  tutti insieme dal server.
- [ ] Apri a mano il vecchio indirizzo `/storico`.
  **Atteso:** ti porta su `/aste`, non a una pagina di errore.

### C5 · Riepilogo admin
- [ ] `/admin/riepilogo` da admin.
  **Atteso:** 14 squadre con budget iniziale, residuo e **slot nella forma
  `24 / 30`**, con la pastiglia che cambia colore quando la rosa è completa.
  La tabella *Ultimi 20 acquisti* mostra gli ultimi acquisti dal più recente.

### C6 · Slot per squadra
- [ ] Sempre in `/admin/riepilogo`: i numeri della colonna Slot devono
  coincidere con quelli di `/rose`. **Se non coincidono**, è il caso d'uso del
  bottone *Ricalcola slot occupati* (test G3).
- [ ] Apri a mano il vecchio indirizzo `/debug`.
  **Atteso:** ti porta su `/admin/riepilogo`. Da manager, invece, ti rimanda a
  `/asta`: il controllo del ruolo viene prima del rimando.

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
- [ ] **Squadre concluse (nuovo).** Quando una squadra ha la rosa piena o non ha
  più nessuno in lista, nella barra della Regia diventa **sbiadita con una
  spunta**, ma resta cliccabile: l'admin deve poterle comunque assegnare il
  turno dopo un annullamento.

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

### D10b · Disposizione su schermo grande
- [ ] Durante un'asta, da computer: **prezzo e tempo restano bassi e affiancati**,
  con la fascia di chi è in testa **subito sotto**, non in fondo al pannello.
  I comandi di rilancio stanno in una colonna a destra, allineata in alto.
  **Atteso:** nessuna striscia vuota alta sotto i due numeri. Il difetto
  precedente nasceva dal fatto che numeri e comandi erano celle della stessa
  griglia: la cella dei comandi, alta il triplo, allungava tutta la riga.
- [ ] Con un nome di squadra lungo la fascia non sfonda il riquadro e non
  compare una barra di scorrimento orizzontale.

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

### D12b · Si capisce che l'asta è finita
- [ ] Lascia scadere il tempo su un'asta in corso.
  **Atteso:** compare una **fascia ambra** sopra il nome del giocatore —
  *«Asta finita: il tempo è scaduto»* — con chi se la aggiudica e a quanto. La
  fascia **lampeggia** quando appare. Prima l'unico segnale era il contatore
  fermo su 0, che è ciò che non si nota mentre si guarda altro.
- [ ] Da admin, nello stesso momento: il pannello **Super-regia** diventa ambra
  e si intitola *«Asta finita · da assegnare»*. Il pulsante da premere è quello
  che c'era già: non ne compare un secondo identico.
- [ ] Da manager, sempre a tempo scaduto: i pulsanti di rilancio sono **spenti**
  e sotto c'è scritto *«Tempo scaduto: l'asta aspetta la chiusura dell'admin»*.
  Prima restavano accesi e il rifiuto — *«L'asta è scaduta!»*, che arriva dal
  server — si scopriva solo dopo aver premuto.
- [ ] Fai ritirare tutti tranne uno **prima** che il tempo scada.
  **Atteso:** la stessa fascia, con il motivo giusto: *«si sono ritirati tutti
  gli altri»*.
- [ ] **Il caso che smaschera un difetto sottile:** avvia un'asta nuova e
  guarda il primo istante. La fascia **non deve comparire e sparire**: il
  contatore parte da zero prima di essere riempito, e chi si basasse solo su
  quello annuncerebbe la fine di un'asta appena cominciata.

### D13 · Chiusura e assegnazione
- [ ] Admin → *Chiudi asta e assegna*.
  **Atteso, tutto insieme:** il giocatore entra nella rosa del vincitore, i
  crediti calano dell'importo esatto, gli slot salgono di uno, il turno di
  chiamata avanza, l'asta compare nella scheda *Assegnati* di `/aste`.
- [ ] Verifica i numeri in `/admin/riepilogo` **e** in `/rose`: devono
  coincidere fra loro.

### D14 · Annullamento dell'acquisto
- [x] `/admin/riepilogo` → sulla riga dell'acquisto appena fatto → *Annulla
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
senza avvisare: schermo del telefono spento, computer in sospensione, passaggio
dal wi-fi alla rete dati. Se cade e non si riaggancia, la pagina continua a
mostrare l'ultimo prezzo ricevuto **senza nessun segnale che è vecchio** —
qualcuno rilancia guardando un numero che non è più quello vero.

**Le due spie, che vanno guardate insieme.**

| Dove | Come si aggiorna |
|---|---|
| Tabellone dell'asta | connessione permanente **più** una rete di sicurezza che ogni 15 secondi richiede comunque lo stato |
| Barra del budget in alto | **solo** connessione permanente, nessuna rete di sicurezza |

Da qui il senso del test: se dopo l'attesa il tabellone si aggiorna ma il budget
in alto resta fermo, la connessione è morta e stai vedendo solo il salvagente.

**Attenzione a come si costruisce l'attesa.** Non far scadere un'asta viva per
poi rilanciare: dopo la scadenza il server rifiuta le offerte con *"L'asta è
scaduta!"*, e non avresti provato nulla. Serve invece qualcosa che possa
succedere **dopo** i cinque minuti, e lo stato *prenotata* è perfetto perché non
ha countdown e non scade.

**Procedura**

1. Un manager chiama un giocatore. L'asta resta in *prenotata · in attesa di
   avvio*: nessun timer parte.
2. Lascia la finestra del manager **ferma e in secondo piano per cinque
   minuti**. Se è un telefono, spegni lo schermo e mettilo giù.
3. Dalla Regia premi **Avvia timer**.
4. Guarda la finestra del manager **senza toccarla e senza ricaricarla**.

- [x] Il countdown parte **entro un secondo** → connessione integra.
- [ ] Parte **dopo qualche secondo, entro quindici** → era caduta, l'ha salvata
  la rete di sicurezza. Utilizzabile, ma **annotalo**: con un timer da 10
  secondi, un ritardo fino a 15 significa vedere il prezzo giusto quando l'asta
  è già finita.
- [ ] **Non parte affatto** → guasto vero. Annota per quanto era rimasta ferma,
  se telefono o computer, e se la rete era cambiata.

5. Porta l'asta a termine e fai assegnare il giocatore dall'admin.

- [x] **I crediti del vincitore nella barra in alto cambiano da soli**, senza
  ricaricare. È la prova che la connessione permanente è viva davvero, non che
  a coprirla sia il salvagente.

### D19 · Tetto ai portieri, in asta

Presuppone una squadra che abbia già il numero massimo di portieri (impostato in
`/admin/setup` → *Regole di lega*).

- [ ] Da quella squadra, guarda la propria lista chiamate: un portiere ha il
  pulsante spento con scritto **Portieri al completo**.
- [ ] Con un portiere all'asta, i comandi di rilancio sono spenti e sotto c'è
  scritto *Hai già il numero massimo di portieri*.
- [ ] Un giocatore di movimento resta chiamabile e rilanciabile normalmente.
- [ ] Dalla Regia, avvia l'asta di un portiere: la squadra col reparto saturo
  **non** deve finire in testa alla base.

### D20 · Massimo automatico

Il tetto vive sul server: dichiarato una volta, risponde da solo dentro la
stessa transazione del rilancio avversario. Servono due manager, A e B.

**Funzionamento base**
- [ ] Con B in testa a 20, A imposta **50**. A passa in testa **all'istante**,
  alla prima cifra utile (21 con rilancio minimo 1).
- [ ] B rilancia a 30 → A torna in testa a 31 **senza che nessuno tocchi la sua
  pagina**.
- [ ] B rilancia a 55 → A resta fermo, e sulla sua pagina il tetto diventa
  **superato** con scritto che da lì in poi decide lui.
- [ ] A preme *Rimuovi* → al rilancio successivo di B non scatta più niente.

**Nessuno rilancia contro sé stesso** (difetto trovato sul campo il 27 agosto)
- [x] A **chiama** un giocatore da 6: resta in testa alla base. Prima che
  l'admin avvii il timer, A imposta un tetto di 15. L'admin avvia il timer.
  **Atteso:** il prezzo resta **6** con A in testa. Prima compariva un'offerta
  AUTOMATICO da **7 a nome di A**, cioè A rilanciava su sé stesso e pagava un
  credito in più senza che nessuno avesse offerto nulla.
  *Verificato il 27 agosto 2026 sull'asta di Santos A. (base 15): la prima
  offerta è dell'avversario a 16, non più un AUTOMATICO del chiamante. Nelle
  due aste precedenti — Busio e Mora — l'offerta fantasma c'era.*
- [x] Ora B rilancia a 8. **Atteso:** solo adesso scatta l'automatico di A, a 9.
  Il tetto serve a rispondere agli avversari, non ad alzare la propria offerta.
  *Verificato sulla stessa asta: 16 dell'avversario, poi AUTOMATICO 17; 18
  dell'avversario, poi AUTOMATICO 19.*
- [ ] **Ancora da fare.** Con A in testa e il tetto più alto in mano ad A, A
  piazza un rilancio **a mano**. **Atteso:** il prezzo resta quello che ha
  appena scritto. Prima l'automatico lo faceva salire ancora di un credito, e a
  ogni risoluzione successiva ancora, fino al suo stesso tetto.
  *Il collaudo del 27 agosto non copre questo caso: in quell'asta chi aveva il
  tetto non ha mai rilanciato a mano.*

**La prova che conta**
- [ ] A imposta il tetto e **chiude la scheda**. B rilancia. A deve risultare di
  nuovo in testa. È ciò che distingue questa soluzione da una che gira nel
  browser.

**Due tetti insieme**
- [ ] A imposta 50, B imposta 40 → il prezzo si ferma a **41** con A in testa, e
  nella scheda *Assegnati* risulta **una sola** offerta automatica, non dieci.
- [ ] A e B impostano **lo stesso** importo → vince chi lo ha dichiarato per
  primo, a quella cifra.

**Segretezza**
- [ ] Dalla console di B: `supabase.from('massimi_asta').select('*')` → **zero
  righe** relative ad A.
- [ ] Ripeti da un account **admin**: zero righe ugualmente. Qui l'admin gioca,
  quindi non ha deroga.

**Ad asta prenotata**
- [ ] B chiama un giocatore ed è in testa alla base; A dichiara 50 **prima**
  dell'avvio del timer. Il prezzo **non si muove** finché l'asta resta
  prenotata. All'avvio, A passa in testa.

**Limiti rispettati**
- [ ] Imposta un tetto superiore al proprio massimo offribile → rifiutato con i
  numeri in chiaro.
- [ ] Con la rosa piena o i portieri esauriti, il tetto non può essere impostato
  e, se già presente, non piazza più offerte.
- [ ] Chi si ritira perde il proprio tetto: dopo *Smetti*, nessun rilancio
  automatico a suo nome.

**Riuso della riga**
- [ ] Chiudi l'asta senza assegnare, rimetti lo stesso giocatore all'asta e
  verifica che nessun tetto della tornata precedente sia ancora attivo.

---

## Blocco E — Modalità delega

Serve quando un manager è assente e l'admin offre per lui. Visibile solo
all'admin, durante un'asta avviata.

### E1 · Comparsa del pannello
- [x] Da admin, durante un'asta in corso, scorri in fondo al tabellone.
  **Atteso:** il pannello ambra *Modalità delega (assenti)* con la tendina delle
  squadre.

### E2 · Selezione della squadra
- [x] Scegli una squadra dalla tendina.
  **Atteso:** compaiono i suoi comandi di rilancio, e il suo massimo offribile.

### E3 · Rilancio per conto terzi
- [x] Usa *+1* e *+5* dal pannello delega.
  **Atteso:** il rilancio risulta a nome della squadra delegata, non
  dell'admin, e si vede su tutti gli schermi.

### E4 · Ritiro per conto terzi
- [x] Ritira la squadra delegata.
  **Atteso:** risulta ritirata come se l'avesse fatto lei.

### E5 · Limiti anche in delega
- [x] Prova a superare il massimo offribile della squadra delegata.
  **Atteso:** rifiutato. La delega non aggira le regole.

### E6 · Delega su chi è già in testa
- [x] Seleziona la squadra che è in testa.
  **Atteso:** i comandi sono disattivati.

### E7 · Massimo automatico in delega
- [ ] Dal pannello delega, imposta un tetto per la squadra assente: si comporta
  come il proprio.
- [ ] Il valore in corso **non** è mostrato, ed è voluto: i tetti li vede solo
  chi li ha impostati.
- [ ] Prova un tetto oltre il massimo offribile della squadra delegata →
  rifiutato. La delega non aggira le regole.

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
- [ ] Deseleziona toccando la riga → i numeri tornano indietro.
- [ ] **La × accanto a un nome scelto**, nel riquadro *I tuoi selezionati*, lo
  toglie senza doverlo ritrovare nella lista lunga.

### F3b · Sapere se la lista è al sicuro
- [ ] Apri la pagina con una lista già salvata.
  **Atteso:** la pastiglia accanto al conteggio dice **«✓ Buste salvate»** in
  verde. A lista mai compilata dice *«Nessuna busta salvata»*.
- [ ] Togli un giocatore e mettine un altro, così da tornare allo **stesso
  numero** di prima.
  **Atteso:** la pastiglia resta **ambra**, *«Buste non salvate»*, e sotto il
  pulsante compare *«La lista è a posto ma non è ancora salvata»*. È il caso
  che conta: contare i nomi non basta, la lista è diversa.
- [ ] Ricarica **senza salvare** → torna la lista del server e la pastiglia
  torna verde. Serve anche a rimediare se il collaudo è finito storto.

### F3c · Filtri e ordinamento
- [ ] Sopra la lista c'è **solo la casella di ricerca** e il pulsante *Filtri*
  (su schermo grande il pannello è già aperto).
- [ ] Cerca il nome di una squadra di Serie A: la ricerca guarda anche quella,
  non solo il nome del calciatore.
- [ ] Dentro il pannello: **Ruolo**, **Squadra**, **Età (under max)** e
  **Ordina per**. Le prime tre contano nel numero sul pulsante, l'ordinamento
  no — non nasconde nessuna riga.
- [ ] *Azzera filtri* riporta l'elenco intero senza toccare la ricerca.
- [ ] Prova un paio di ordinamenti: chi non ha l'età deve restare **in fondo**
  in entrambi i versi, non in cima.

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

### F7 · Riservatezza (riscritto il 28 agosto: la regola è cambiata)
La segretezza serve mentre la fase è aperta. A spoglio avvenuto decade, e gli
esiti diventano pubblici.

- [ ] **A fase aperta**, da un secondo manager: non vede in alcun modo le
  selezioni altrui ancora in attesa. È qui che l'asta al buio va protetta.
- [ ] Prova anche dalla console, che è la verifica vera perché scavalca
  l'interfaccia:
  `await supabase.from('buste').select('*').eq('esito','ATTESA')`
  **Atteso:** tornano **solo** le proprie righe. Se ne tornano di altre
  squadre, la policy `lettura_buste` è sbagliata e la fase buste non è più
  segreta.
- [ ] Stessa chiamata senza filtro sull'esito: le righe **già spogliate**
  (VINTO, CONTESO, PERSO) di tutte le squadre ora si vedono, ed è voluto.

### F7b · Sommario buste
- [ ] In fondo a `/buste`, in **entrambe** le fasi, c'è il pannello *Sommario
  buste* con chi è stato assegnato senza passare dall'asta, di tutte le
  squadre, raggruppato per turno dal più recente.
- [ ] Il conteggio in alto a destra corrisponde al numero di righe elencate.
- [ ] Confronta un paio di nomi con `/rose`: la fantasquadra e il prezzo devono
  coincidere.
- [ ] Prima di qualunque spoglio il pannello **non deve comparire affatto**,
  invece di mostrarsi vuoto.

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

### F13b · Un giocatore in coda per l'asta non è selezionabile
- [x] Riapri la fase buste lasciando dei contesi ancora da assegnare. Cerca uno
  di quei giocatori nell'elenco di `/buste`.
  **Atteso:** non c'è. Altrimenti, da richiedente unico, se lo aggiudicherebbe
  alla quotazione saltando l'asta che gli altri contendenti aspettavano.
  *Verificato il 27 agosto 2026 con la fase buste aperta al turno 2 e 21
  giocatori in coda ancora liberi: l'elenco ne mostra 255 invece di 276.*
- [ ] **Ancora da fare — e senza questa il resto è solo interfaccia nascosta.**
  La porta di servizio. Dalla console del
  browser, a fase buste aperta, chiama `submit_buste` includendo l'id di un
  giocatore conteso:
  `await supabase.rpc('submit_buste', { p_giocatori_ids: [ ...gli altri..., <id conteso> ] })`
  **Atteso:** errore *«Uno o più giocatori selezionati non sono disponibili o
  sono già in coda per l'asta.»*, e nessuna busta salvata. Se salva, l'elenco
  nascosto è solo apparenza.

### F14 · Tetto ai portieri, nelle buste

- [ ] Da una squadra col reparto portieri saturo, apri `/buste` a fase aperta:
  le schede dei portieri sono spente e non si selezionano.
- [ ] Da una squadra che può ancora prenderne uno, il riepilogo mostra la riga
  **Portieri** col conteggio selezionati su disponibili.
- [ ] Seleziona più portieri di quanti puoi: il pulsante di salvataggio resta
  spento e il messaggio dice quanti ne puoi prendere.

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
  **Atteso:** messaggio di completamento, e i numeri della colonna Slot in `/admin/riepilogo` coincidono con
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

### G6 · Cambio del limite portieri
- [ ] `/admin/setup` → *Regole di lega*: cambia il massimo, salva, ricarica.
  **Atteso:** il valore resta, e i controlli in asta e nelle buste seguono il
  numero nuovo.
- [ ] Prova da un account **admin non super**: la pagina non è nemmeno
  raggiungibile.

### G7 · I due contatori
- [ ] `/admin/setup` → *Regole di lega*: imposta **20** alla prima chiamata e
  **10** dopo un rilancio, salva, ricarica. I valori restano.
- [ ] Prova a salvare **1 secondo**. **Atteso:** rifiutato, minimo 3.
- [ ] Avvia un'asta e cronometra: il primo conto alla rovescia parte da **20**.
- [ ] Rilancia: il contatore riparte da **10**, non da 20.
- [ ] Fai scattare un **rilancio automatico** (tetto massimo di un altro
  manager). **Atteso:** anche quello ricarica da 10.

### G8 · Elenco utenti in ordine
- [ ] `/admin/setup` → *Gestione utenti*: le fantasquadre sono in ordine
  alfabetico, non sparse. Chi non ha squadra sta in fondo.

---

## Blocco H — Export

L'export ha **un solo formato**, quello che fantacalcio.it accetta in import.
Ricavato confrontando un loro export vero con quello che generavamo prima e che
loro rifiutavano.

### H1 · Download
- [ ] `/admin/riepilogo` → *Scarica CSV*.
  **Atteso:** scarica un file chiamato `rose-2026-08-04_20-09-43.csv`, con data
  **e ora italiana**. Due export nello stesso giorno devono avere nomi diversi.

### H2 · Struttura
- [ ] Apri il file con un editor di testo, **non** con Excel.
  **Atteso:** la prima riga è `$,$,$`; poi le rose, una squadra per blocco, con
  una riga `$,$,$` **prima di ognuna** — tante quante le squadre, non una in
  meno. Ogni riga di dati ha tre campi nell'ordine
  `fantasquadra,id,costo`: il **nome per primo**, non l'id.
- [ ] Nessuna riga di intestazione con i nomi delle colonne: al suo posto c'è
  il primo `$,$,$`.

### H3 · La prova che conta
- [x] **Carica il file su fantacalcio.it.** È l'unica verifica che vale: il
  formato è stato ricostruito dal loro export, non da una loro
  documentazione, quindi finché non lo accettano davvero sappiamo solo che
  *somiglia* al loro.
  *Importazione riuscita il 27 agosto 2026, con 300 tesseramenti su 10 squadre.*

### H4 · Excel storpia gli accenti, ed è previsto
- [ ] Apri il CSV con Excel.
  **Atteso:** se una fantasquadra ha un accento, Excel lo mostra sbagliato
  (`Ã¨` al posto di `è`). **Non è un difetto da segnalare**: il file non ha più
  la marcatura iniziale che lo diceva a Excel, perché quella marcatura è un
  byte invisibile davanti al primo `$,$,$` e fa fallire l'import senza dire
  perché. Questo file serve a loro, non a Excel.

### H5 · Virgole nei nomi
- [ ] Se una fantasquadra ha una virgola nel nome, controlla che il loro import
  la accetti. Il nome viene messo fra virgolette secondo lo standard CSV, che è
  la cosa corretta da scrivere, ma non sappiamo se il loro lettore le
  interpreti o spezzi la riga in quattro campi.

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
- [ ] **Riscritto: la descrizione precedente non vale più.** `/svincolati` e
  `/aste` (entrambe le schede) non mostrano più un'etichetta per ogni valore:
  sotto il nome c'è **una riga sola** — ruoli · squadra · età · prezzo —
  separata da punti mediani. L'unità sta dentro il valore: «27 anni», «10 cr».
  **Atteso:** quella riga non va a capo se non serve. Se un valore finisce da
  solo su una riga sua, una cella è rimasta di tipo blocco.
- [ ] `/admin/riepilogo` e `/admin/setup`: scorrono in orizzontale con la prima
  colonna che resta ferma.

### I3b · Quanto si vede in una schermata
- [ ] `/svincolati` sul telefono: dalla cima del riquadro devono vedersi
  **almeno sei giocatori** senza scorrere. Prima erano due.
- [ ] `/aste` sul telefono: **almeno quattro**. Sono meno che negli svincolati
  perché ogni scheda porta anche le pastiglie dei contendenti, che di proposito
  non vengono troncate: sono l'informazione per cui quella pagina esiste.
- [ ] Con quattro contendenti dai nomi lunghi le pastiglie **vanno a capo** e
  non escono dal riquadro; la pagina non si sposta di lato.

### I3c · Filtri a scomparsa
- [ ] Sul telefono, sopra la lista si vede **solo il campo di ricerca** e un
  pulsante **Filtri**. Prima erano cinque comandi impilati su `/svincolati`.
- [ ] Tocca *Filtri*: si apre il pannello con gli altri filtri e, su
  `/svincolati`, con la tendina *Ordina per*.
- [ ] Scegli un filtro e richiudi il pannello.
  **Atteso:** sul pulsante compare **quanti filtri sono attivi**. È ciò che
  impedisce di guardare una lista quasi vuota senza capire perché.
- [ ] *Azzera filtri*, dentro il pannello, riporta la lista intera. La ricerca
  per nome non viene toccata: non è fra i filtri contati.
- [ ] **Su schermo grande niente deve cambiare:** i filtri restano tutti aperti,
  il pulsante *Filtri* non esiste, i quattro riquadri di riepilogo di `/aste`
  tornano al loro posto, le tabelle restano tabelle con l'intestazione e i
  valori non portano più «anni» e «cr», perché a dirlo c'è la colonna.

### I4 · Asta live sul telefono
- [ ] Durante un'asta: **prezzo e tempo stanno affiancati sulla stessa riga**, e
  i pulsanti di rilancio si vedono **senza scorrere**. Prima erano tre blocchi
  in colonna con "il tuo massimo" in mezzo, e per rilanciare bisognava scendere.
- [ ] I bottoni si toccano senza sbagliare mira.
- [ ] "Il tuo massimo" ora sta sopra i pulsanti: è lì che serve, mentre si
  decide quanto offrire.
- [ ] Chi è in testa sta in una **fascia a tutta larghezza** sotto prezzo e
  tempo: verde con la corona quando sei tu, ambra col nome dell'avversario
  altrimenti. Con un nome di squadra lungo **non deve sfondare** il riquadro.
- [ ] **A ogni rilancio la fascia lampeggia** una volta. Fallo verificare a chi
  guarda senza toccare niente: il punto è accorgersi che qualcosa è cambiato
  senza fissare il numero.

### I4b · A chi tocca, sul telefono
- [ ] Senza aste in corso, guarda l'ordine di chiamata.
  **Atteso:** una riga a parole dice **«Tocca a <squadra>»**, e quando è il tuo
  turno diventa **«Tocca a te»** su fondo verde. Prima lo si doveva dedurre dal
  colore di una pillola in una fila che scorre.
- [ ] Se non è il tuo turno, la stessa riga dice **quanti turni mancano** al tuo.
- [ ] Quando il turno avanza, la pillola di chi tocca **si porta in vista da
  sé**: non devi trascinare la barra per trovarla.

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
- [ ] **Prima di caricare, leggi la scheda.** Deve portare un avviso ambra che
  dice che il caricamento **azzera tutte le rose** e le ricostruisce solo da
  FantaSquadra e Costo del file, e che i crediti non vengono ricalcolati.
  **Atteso:** l'avviso c'è, e i pulsanti *Importa* delle due schede affiancate
  restano allineati — la scheda accanto non deve restare mezza vuota.
- [ ] Carica il listone Mantra.
  **Atteso:** **1014 giocatori, 420 tesseramenti**. Attenzione: quei numeri
  valgono per il file usato allora. Letto l'8 agosto 2026, `DFL - Dolomiti
  Fanta League (2).xlsx` contiene **924 righe e 383 con FantaSquadra**: prima
  di dire che l'import ha sbagliato, controlla quale file stai caricando.
  Se compaiono avvisi su fantasquadre non trovate, annota i nomi: non
  coincidono con quelli in anagrafica.
- [ ] Ricarica **lo stesso file due volte**.
  **Atteso:** non si creano doppioni.

### J3 · Import liste aste
- [ ] Carica il file delle liste a chiamata.
  **Atteso:** sostituisce le liste esistenti; i contendenti compaiono in Regia.

### J4 · Controlli dopo l'import
- [ ] `/rose`: 14 squadre a 30/30.
- [ ] `/svincolati`: **455** giocatori.
- [ ] Un giocatore noto mostra i ruoli Mantra e l'età giusti.

### J4b · Filtro Mantra nelle buste
- [ ] `/buste` a fase aperta: la tendina *Ruolo* ora ha due gruppi, reparto e
  ruolo Mantra, come in `/svincolati`.
  **Atteso:** filtrare per un ruolo Mantra funziona. Prima la tendina offriva
  solo P/D/C/A, ed era proprio la pagina in cui i reparti scoperti si guardano
  di più.

### J5 · Hard reset
- [ ] `/admin/setup` → *Hard reset lega*.
  **Atteso:** la finestra rossa chiede di scrivere `CONFERMO`; il bottone di
  esecuzione resta **disattivato** finché non è scritto esattamente così.
- [ ] Scrivi qualcosa di diverso → resta disattivato.
- [ ] Premi *Annulla* → non succede nulla.
- [ ] Scrivi `CONFERMO` ed esegui.
  **Atteso:** squadre, giocatori e aste cancellati.
- [ ] Prima del reset **attiva i trasferimenti**; dopo il reset ricontrolla
  `/admin/setup` → *Funzioni attive*.
  **Atteso:** risultano **spenti**. Prima restavano accesi: il reset chiudeva la
  fase buste ma non quella del mercato.

### J6 · La prova del nove
- [ ] Dopo il reset, esci e rientra come super admin.
  **Atteso:** **il ruolo è ancora SUPER_ADMIN.** È esattamente il punto che si
  rompeva e che aveva richiesto sei script di ripristino.

---

## Blocco K — Mercato trasferimenti

> Serve la funzione **attivata** dal super admin (`/admin/setup` → *4 · Funzioni
> attive* → *Attiva i trasferimenti*) e **nessuna asta viva**. Da fare in due
> manager più l'admin, perché ogni scambio attraversa tutti e tre.
>
> Uno scambio eseguito **non si può annullare**: non esiste nulla di simile ad
> *Annulla acquisto*. Fare questo blocco sapendolo.

### K0 · La funzione spenta non esiste
- [ ] Con i trasferimenti **spenti**, da manager: nel menu *Manager* non c'è
  *Lista Trasferimenti*, e nel menu *Admin* non c'è *Ratifica Scambi*.
- [ ] `/mia-rosa` mostra la rosa e **nient'altro**: niente campi prezzo, niente
  pulsanti, niente avviso giallo, niente conteggio «in vetrina».
- [ ] Apri a mano `/trasferimenti` e `/admin/trasferimenti`.
  **Atteso:** rimandano altrove, non caricano.
- [ ] **La porta di servizio.** Dalla console del browser, da manager:
  `await supabase.rpc('imposta_vetrina', { p_giocatore_id: <un tuo giocatore>, p_in_vendita: true })`
  **Atteso:** «I trasferimenti non sono attivi.» Senza questo, nascondere i
  pulsanti sarebbe solo apparenza.
- [ ] Da **admin non super**, `/admin/setup` rimanda a `/asta`: l'interruttore
  è del solo super admin.
- [ ] Con un manager fermo su `/mia-rosa`, **attiva** la funzione da un'altra
  finestra. **Atteso:** la voce di menu compare **senza ricaricare**.

### K1 · La vetrina
- [ ] `/mia-rosa`: compare solo la tua rosa, ordinata per reparto.
- [ ] Metti un giocatore in lista **lasciando il prezzo vuoto**.
  **Atteso:** il bottone diventa *Rimuovi dalla lista* e compare *In vetrina ·
  aperto a offerte*.
- [ ] Mettine un altro **con un prezzo**.
  **Atteso:** il chip mostra la cifra.
- [ ] `/trasferimenti` da un **altro manager**: entrambi compaiono, con il
  proprietario giusto e la colonna *Chiede* coerente.
- [ ] Togli il primo dalla lista.
  **Atteso:** sparisce dalla vetrina dell'altro manager **senza ricaricare**.
- [ ] Con la funzione **spenta**, i comandi di `/mia-rosa` non ci sono proprio
  (già coperto da K0, qui si ricontrolla dopo aver usato la vetrina).

### K2 · Offerta di soli soldi
- [ ] Da `/trasferimenti`, *Fai un'offerta* su un giocatore in vetrina, solo crediti.
  **Atteso:** *Valore contropartita* pari alla cifra digitata.
- [ ] Offri **più crediti di quelli che hai**.
  **Atteso:** l'invio è bloccato e la riga sotto il campo lo dice.
- [ ] Invia un'offerta valida → compare fra le *Offerte inviate* come *In attesa*,
  e fra le *Ricevute* dell'altro manager.
- [ ] Prova a farne **una seconda sullo stesso giocatore**.
  **Atteso:** rifiutata con «Hai già un'offerta aperta per questo giocatore».

### K3 · Offerta con calciatori
- [ ] Costruisci un'offerta con **crediti + due tuoi calciatori**.
  **Atteso:** il valore mostrato è crediti + le due quotazioni, e la frase sotto
  dice a quanto risulterà costato il giocatore.
- [ ] Costruiscine una con **soli calciatori**, zero crediti. Deve essere inviabile.
- [ ] Prova a inviare un'offerta **vuota**. **Atteso:** bloccata.

### K4 · Rifiuto e ritiro
- [ ] Il ricevente **rifiuta** una delle offerte.
  **Atteso:** stato *Rifiutata*, e in `/rose` **non si muove nulla**.
- [ ] Il proponente **ritira** un'offerta ancora in attesa. **Atteso:** *Ritirata*.
- [ ] Prova a ritirarne una **già accettata**. **Atteso:** non è più ritirabile.

### K5 · Accettazione e ratifica
- [ ] Il ricevente **accetta**. **Atteso:** *Accettata · attende l'admin*, e nulla
  è ancora cambiato in `/rose`.
- [ ] `/admin/trasferimenti`: l'offerta compare con i due versi, e i numeri di
  crediti e slot **prima → dopo** per entrambe le squadre.
- [ ] **Respingi** una prima offerta. **Atteso:** *Non ratificata*, nulla si muove.
- [ ] **Esegui** la seconda. Poi controlla, uno per uno:
  - [ ] i giocatori sono passati alle squadre giuste in `/rose`;
  - [ ] i crediti di entrambe corrispondono a quelli annunciati;
  - [ ] gli slot di entrambe corrispondono;
  - [ ] i giocatori scambiati **non sono più in vetrina**;
  - [ ] il navbar del manager che ha speso mostra subito il nuovo budget.

### K6 · Il prezzo
- [ ] Offerta di **20 crediti + un calciatore da quotazione 15**, eseguita.
  **Atteso:** in `/mia-rosa` il giocatore ricevuto risulta *pagato 35 cr*.
- [ ] Scambio con **due calciatori ceduti** per uno da quotazione 30.
  **Atteso:** i due, nella rosa di chi li riceve, hanno prezzi che **sommano
  esattamente 30**. Nessun credito perso per arrotondamento.

### K7 · I limiti
- [ ] Costruisci uno scambio che porterebbe una squadra a **quattro portieri**.
  **Atteso:** rifiutato, con il numero e il massimo nel messaggio.
- [ ] Scambio **portiere per portiere** con una squadra che ne ha già tre.
  **Atteso:** passa. È il caso che il conteggio secco sbaglierebbe.
- [ ] Scambio due-per-uno che porterebbe una rosa **oltre i 30**.
  **Atteso:** rifiutato.

### K8 · Decadenza
- [ ] Due manager fanno **entrambi un'offerta sullo stesso giocatore**; il
  proprietario accetta la prima e l'admin la esegue.
  **Atteso:** la seconda risulta **Decaduta**, senza che nessuno l'abbia toccata.

### K9 · Riservatezza
- [ ] Da un **terzo manager** estraneo alla trattativa, `/trasferimenti` non
  mostra le offerte altrui in attesa, ma mostra gli **scambi conclusi**.
- [ ] Dalla console del browser di quel manager:
  `await supabase.from('offerte_trasferimento').select('*')`
  **Atteso:** solo righe con stato `ESEGUITA`.

### K10 · Spegnere e riaccendere non perde niente
- [ ] Con due giocatori in vetrina e una trattativa **accettata** in sospeso,
  disattiva la funzione da *Impostazioni*.
  **Atteso:** la finestra di conferma **annuncia il numero** di trattative
  aperte prima di procedere. Da provare con una trattativa fra **altri due**
  manager, non tue: è il caso in cui un conteggio letto dal browser sbaglierebbe.
- [ ] Riattiva.
  **Atteso:** le due vetrine e la trattativa sono ancora lì, intatte. Spegnere
  nasconde, non cancella.

---

## Cose già note, da non segnalare come nuove

| Cosa | Stato |
|---|---|
| I due contatori si regolano da `/admin/setup` → *Regole di lega* | Risolto: prima chiamata e dopo-rilancio sono due valori distinti |
| `npm audit` non segnala più nulla | Risolto l'8 agosto 2026: `npm audit fix`, Next a 16.3.0, e `xlsx` preso dal CDN di SheetJS, dove esistono le versioni corrette |
| Le emoji nei menu e nei pulsanti | Risolto: marchio disegnato, emoji rimosse da menu e pulsanti |

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
