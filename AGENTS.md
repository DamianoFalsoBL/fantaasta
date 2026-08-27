<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Come lavorare su questo progetto

Scritto per chiunque — persona o assistente — apra il progetto senza conoscerne
la storia. Le regole qui sotto non sono preferenze estetiche: ognuna nasce da
qualcosa che è già andato storto almeno una volta.

## La lingua

**Si parla e si scrive in italiano.** Vale per le risposte in chat, per i
messaggi di commit, per i commenti nel codice, per i testi dell'interfaccia e
per la documentazione. Restano in inglese soltanto i nomi tecnici che in
italiano non esistono.

## Misurare, non supporre

È la regola che conta più di tutte le altre.

Prima di dire che qualcosa funziona, **eseguilo**. Un progetto che compila non
è un progetto che gira: avvia il server, interroga le rotte, leggi il database,
apri il file vero dell'utente. Quando una spiegazione è plausibile ma non
verificata, dillo esplicitamente invece di presentarla come un fatto.

Quando un'ipotesi si rivela sbagliata, dillo e correggi. È già successo di
inseguire la causa sbagliata per un'ora perché nessuno aveva controllato il
dato: la diagnosi verificata batte quella elegante.

Vale anche al contrario: se una stima si rivela pessimista, correggila con lo
stesso vigore con cui l'avevi difesa.

## Cosa fa l'utente e cosa non deve fare l'assistente

L'assistente **non** esegue:

- l'accesso al sito e l'inserimento di password;
- il caricamento di file dal disco;
- i pulsanti distruttivi — reset, cancellazioni definitive, azzeramenti;
- il push delle migration al database.

Queste cose le fa l'utente. L'assistente prepara, spiega dove premere e cosa
aspettarsi, e **verifica dopo**. Il controllo a posteriori — leggere il
database e confrontare i numeri con il file di partenza — vale più di qualunque
automazione, e ha già scovato problemi che l'assenza di errori nascondeva.

## Segreti

**La chiave di servizio del database non va mai nel frontend.** Solo dentro
codice che gira sul server: server action, route handler, script locali. Se una
funzione ha bisogno di scavalcare le policy di riga, si scrive lato database in
`SECURITY DEFINER`, non si sposta la chiave.

## Commit, versione, deploy

Una modifica per commit, e **commit separabili separati**: se tre cose
indipendenti finiscono insieme e una rompe, non si può tornare indietro solo su
quella. Un aggiornamento di dipendenze, un cambio di framework e una
riscrittura vanno in tre commit distinti anche se escono con un solo push.

**Prima di ogni push, alza `version` in `package.json`.** Minor per una
funzione nuova, patch per correzioni. Il piè di pagina del sito mostra quel
numero: è l'unico modo, guardando la produzione, di sapere quale build si sta
vedendo — e serve soprattutto durante i collaudi, per capire se qualcuno ha in
cache una versione vecchia.

Il messaggio di commit spiega **perché**, non cosa. Il cosa lo dice il diff.
Se una scelta ha scartato un'alternativa ragionevole, scrivi quale e per quale
motivo.

**Non committare se il build non passa.** È già capitato di mandare in
produzione codice rotto per aver concatenato i comandi con `;` invece che con
`&&`.

## Il database

Se il progetto ha un database gestito con migration:

- **ogni modifica allo schema passa da un file di migration**, mai dall'editor
  SQL della console. Le modifiche fatte a mano rendono lo schema reale diverso
  da quello versionato, e rimetterli in pari costa giorni;
- quando ridefinisci una funzione esistente, **copia il corpo alla lettera** e
  cambia solo ciò che serve. Riscriverla a memoria è il modo classico di
  perdere una guardia che qualcuno aveva aggiunto per un motivo;
- le funzioni distruttive vanno rilette prima di toccarle, non ricordate.

## I commenti nel codice

Questo progetto commenta **il perché**, e in particolare le trappole. Non
`// incrementa il contatore`, ma la ragione per cui una riga è scritta in un
modo che sembra strano:

```ts
// IS DISTINCT FROM e non <>: con un profilo senza squadra il valore è NULL,
// il confronto varrebbe NULL, l'IF non scatterebbe e il controllo di
// proprietà salterebbe del tutto.
```

Quando correggi un difetto, lascia sul posto una riga che spiega cosa
sbagliava. È ciò che impedisce a qualcuno — spesso a te stesso fra sei mesi —
di "semplificare" tornando all'errore.

## Nomi e testi dell'interfaccia

**Brevi e precisi, in quest'ordine di importanza: prima precisi, poi brevi.**
Un nome che descrive il meccanismo invece del contenuto va cambiato. Due voci
che si distinguono per una lettera vanno rinominate, perché costringono a
fermarsi a pensare.

Niente emoji come segnaposto decorativi. Restano solo dove portano
informazione, per esempio un segnale di pericolo su un'azione irreversibile.

## Documenti di collaudo

Se il progetto ha un piano di test con caselle da spuntare:

**non spuntare mai una casella che nessuno ha davvero eseguito.** E se una
modifica rende obsoleto un test già superato, **togli la spunta** e scrivi
perché. Un documento che dichiara verificato ciò che non lo è vale meno di zero:
dà la falsa sicurezza esattamente dove serve prudenza.

## Quando fermarsi e chiedere

Procedi da solo sulle scelte ordinarie. Fermati e chiedi quando:

- la decisione è irreversibile e non c'è modo di tornare indietro;
- cambia da dove arriva una dipendenza — un registro diverso, un CDN, un
  pacchetto sostituito;
- i dati raccolti strada facendo **contraddicono il piano già approvato**. In
  quel caso non eseguire il piano per obbedienza: porta i numeri nuovi e
  rifai la scelta insieme.

## La lista delle cose da fare

Le attività aperte stanno in **`todolist.md`**, nella radice del progetto. Non
in un registro esterno e non nella memoria di una conversazione, perché una
conversazione finisce e quel che c'era dentro si perde.

**Va aggiornata a ogni lavoro**: quando una voce si chiude si sposta in *Fatto
di recente* con la data, quando ne nasce una ci si scrive dentro il contesto
per riprenderla a freddo. Se una richiesta viene rimandata, finisce lì con il
perché — soprattutto se la ricerca per deciderlo è costata tempo, che è
esattamente quello che nessuno vuole rifare.

## Cose notate di sfuggita

Se durante un lavoro noti un problema fuori tema, **non allargare il lavoro in
corso**: annotalo in `todolist.md`, con dentro il contesto necessario a
riprenderlo a freddo — file, righe, perché è un problema, e quale scorciatoia
apparente sarebbe sbagliata.
