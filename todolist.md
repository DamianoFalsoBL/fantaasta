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

### Scheda giocatore in `/svincolati` — ferma in attesa della chiave

Piano deciso il 29 agosto e **sonda già scritta**; nient'altro costruito.

Il primo passo è una misura, non del codice: `scripts/sonda-api-football.mts`
spende tre richieste e dice se il piano gratuito copre la **stagione in corso**.
Se non la copre la scheda mostrerebbe la carriera di due anni fa, e si riapre la
scelta della fonte invece di costruire su un dato vecchio.

```
node --experimental-strip-types scripts/sonda-api-football.mts
```

**Serve solo che tu apra un account gratuito** su
<https://dashboard.api-football.com/register> (non chiede la carta) e metta la
chiave in `.env.local` come `API_FOOTBALL_KEY`. È già documentata in
`.env.example`. Non va su Vercel: la sincronizzazione è uno script locale,
perché con 10 richieste al minuto un giro completo dura 4-6 minuti e una
funzione su Vercel verrebbe interrotta molto prima.

**Il piano completo è in [docs/scheda-giocatore.md](docs/scheda-giocatore.md)**:
tabella, sincronizzazione, abbinamento per cognome dentro la rosa del club,
interfaccia, e le trappole — soprattutto quella dei 14 cognomi condivisi, dove
un abbinamento sbagliato mostra la carriera di un altro giocatore e sembra un
dato invece che un guasto.

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
