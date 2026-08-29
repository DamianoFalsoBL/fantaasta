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

Parcheggiata in attesa dei consumi, ma **attenzione a non trarre la conclusione
sbagliata dai numeri di agosto**: il collaudo del 18 e l'asta del 27 non hanno
messo sotto sforzo questa query, perché le liste erano corte — le rose erano
state importate, non battute. Con le liste piene torna a pesare.

**Trappola:** non disattivare il salvagente quando non c'è un'asta in corso. È
esattamente il caso per cui esiste.

### Leggere i consumi di Supabase e Vercel dopo l'asta del 27 agosto

Ora che un'asta vera c'è stata, il confronto ha senso. La fotografia di
partenza dell'8 agosto: Supabase egress 71 MB, database 26,83 MB, realtime
1.000 messaggi, picco connessioni 6, 46 MAU; Vercel Fast Data 44,51 MB su
100 GB, Fast Origin 34,09 MB su 10 GB, Edge Requests 4.852 su 1M, Invocations
5.973 su 1M.

**Il numero che conta non è l'egress ma il picco di connessioni realtime.** Se
arriva al numero dei presenti, il tempo reale ha funzionato per tutti; se resta
a 5-6, una parte dei telefoni riceveva gli aggiornamenti solo grazie al
salvagente ogni 15 secondi — cioè «sembrava funzionare».

Il ciclo Supabase si è chiuso il 12 agosto: il confronto va fatto sul grafico
giornaliero, non sul totale del mese.

### Duplicare il sito per una seconda lega

Rimandato dall'utente. Nota: Supabase somma egress e messaggi realtime di
**tutti** i progetti dell'organizzazione; solo lo spazio del database è per
progetto.

---

## Rimandato con dossier a parte

### Scheda giocatore in `/svincolati`

Una colonna con l'icona **i** che apre una scheda con anagrafica e storico.
Ricerca fatta il 27 agosto, decisione presa, costruzione rimandata.

**Il dossier completo è in [docs/scheda-giocatore.md](docs/scheda-giocatore.md)**:
com'è costruita la sincronizzazione, quali file toccare, le trappole e la
verifica. Qui sotto solo quel tanto che serve a decidere se riprenderlo.

**BigBallsData, l'API indicata all'inizio, non può fornire quei dati**: gli id
sono UUID interni e la loro documentazione dice di non portare id da altri
fornitori; per il calcio non esiste ricerca per nome; e non ci sono
nazionalità, data di nascita né storico per stagione.

**Fonte scelta: API-Football (api-sports.io)**, che ha tutti i campi e permette
di elencare i giocatori squadra per squadra — una ventina di richieste per
tutti e 548 del listone.

Prima cosa da fare quando si riprende: **provare con una chiave vera** su dieci
giocatori nostri, perché il piano gratuito dà 100 richieste al giorno e limita
le stagioni accessibili in un modo che la documentazione pubblica non dice.
Serve un account gratuito e la chiave fra le variabili d'ambiente su Vercel:
è un passaggio dell'utente.

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

## Notato di sfuggita

- **Il collaudo di oggi è tutto da eseguire.** Le modifiche del 29 agosto hanno
  aggiunto le caselle A11c (reset password dal super admin), B6 (titoli
  allineati), C2c (stemmi) e C2d (colonne sul telefono), e hanno **tolto la
  spunta ad A4**, perché il messaggio d'errore dell'accesso è cambiato. Nessuna
  di queste è stata provata sulla produzione: sono state verificate in
  sviluppo, misurando, ma è un'altra cosa.
- **A 320px il nome della squadra si tronca** in `/svincolati`. È il ripiego
  previsto e non un difetto scoperto per caso: sotto quella larghezza le
  quattro colonne non entrano. Riguarda i telefoni molto vecchi (iPhone SE di
  prima generazione); se salta fuori qualcuno che ce l'ha, la strada è togliere
  una colonna, non stringerle tutte.
- **`public/loghi/serie-a.png` non è usato da nessuna parte.** È lo stemma del
  campionato, scaricato insieme agli altri venti. Lasciato lì perché non dà
  fastidio e potrebbe servire da segnaposto, ma se si vuole fare pulizia si può
  togliere.
- **F13b non è ancora chiuso.** L'elenco di `/buste` nasconde i giocatori già
  in coda per l'asta — verificato il 27 agosto — ma nessuno ha ancora chiamato
  `submit_buste` dalla console per controllare che la funzione li **rifiuti**.
  Finché non si fa, sappiamo che l'interfaccia nasconde, non che la porta sia
  chiusa.
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

## Fatto di recente

| Quando | Cosa |
|---|---|
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
