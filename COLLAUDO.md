# Collaudo FantaAsta

> Per il collaudo completo del sito **in produzione** usa
> [TEST-PRODUZIONE.md](TEST-PRODUZIONE.md): copre ogni bottone e ogni caso
> limite. Questo documento resta come giro rapido in locale.

Checklist per provare il sito end-to-end. Segui l'ordine: ogni sezione dipende dalla precedente.

Per avviare:

```bash
npm run dev
```

---

## 0. Prima di iniziare (una volta sola)

- [ ] **Ruotare la chiave `service_role`** dalla dashboard Supabase → *Project Settings → API Keys*. Quella attuale era finita in chiaro nel repo.
- [ ] Aggiornare `NEXT_PUBLIC_SUPABASE_ANON_KEY` **e** `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (ruotare il JWT secret le cambia entrambe).
- [ ] Riavviare `npm run dev` e rifare il login.

---

## 1. Accesso e ruoli

- [ ] Login come `superadmin@fantacalcio.local` → devi finire su `/admin/setup`.
- [ ] La navbar mostra 👑 e **non** mostra il menu "Area Utente".
- [ ] In `/admin/setup`, sezione *Gestione Utenti*: premi "Rendi Admin" su una squadra. Il ruolo cambia senza errori.

  > È il punto che prima falliva con `infinite recursion detected in policy for relation "profili"`.

- [ ] Riporta la stessa squadra a Manager.
- [ ] Apri `/asta` da super admin → ti rimanda a `/admin/setup`.
- [ ] In una finestra anonima, prova ad aprire `/admin/setup` senza login → non deve mostrare nulla della pagina.

---

## 2. Import dei dati

- [ ] `/admin/setup` → card **"Listone Giocatori & Rose"** → carica il listone Mantra da `db_excel/`.

  Atteso: **1014 giocatori importati, 420 tesseramenti creati**.

- [ ] Se compaiono avvisi su *"Fantasquadre non trovate a database"*, annota quali nomi: significa che non coincidono con quelli in `squadre.nome`.
- [ ] `/rose` → tutte e 14 le squadre a **30 / 30** slot occupati.
- [ ] `/svincolati` → **455** giocatori (i 594 liberi meno i 140 fuori lista).
- [ ] Un giocatore mostra il badge Mantra corretto (es. Olise → `W`, `A`) e l'età.

Se i budget non sono quelli che ti aspetti, ricarica prima il file **Utenti & Budget** e poi di nuovo il listone.

---

## 3. Asta live

Serve almeno **due browser diversi** (o uno normale + uno in incognito): admin da una parte, manager dall'altra.

- [ ] Carica le **Liste Aste a Chiamata** da `/admin/setup`, oppure inserisci qualche riga a mano in `liste_aste`.
- [ ] `/admin/asta` → **Sorteggia ordine di chiamata**. L'ordine compare anche sul tabellone del manager **senza ricaricare la pagina**.

  > Prima non poteva funzionare: `regole_lega` non era nella publication realtime.

- [ ] Dal manager di turno: chiama un giocatore. L'asta compare da entrambi i lati.
- [ ] Admin: **Avvia timer**. Il countdown parte e scorre **fluido**, senza scatti o ripartenze.

  > L'intervallo veniva ricreato a ogni evento realtime.

- [ ] Da un secondo manager: rilancia. Prezzo e squadra in testa si aggiornano su tutti gli schermi.
- [ ] Prova a rilanciare oltre il tuo massimo offribile → messaggio con **i numeri corretti** fra parentesi.
- [ ] Premi **Abbandona** da un manager non in testa → il pulsante funziona e la squadra risulta ritirata.

  > La RPC `abbandona_asta` non esisteva: il pulsante dava sempre errore.

- [ ] Chi è in testa prova ad abbandonare → deve essere rifiutato.
- [ ] Admin: **Chiudi asta**. Il giocatore entra nella rosa, i crediti scalano, lo slot aumenta, il turno avanza.
- [ ] `/storico` mostra l'asta appena conclusa.

---

## 4. Buste di riparazione

- [ ] `/admin/riepilogo` → apri la fase buste. La pagina `/buste` del manager si sblocca **da sola**, senza refresh.
- [ ] Da manager: seleziona **esattamente** il numero di slot liberi. Con uno in meno o in più deve rifiutare.
- [ ] Supera il budget con le selezioni → deve rifiutare.
- [ ] Invia, poi `/admin/riepilogo` → **Elabora buste**.
- [ ] Chi era solo su un giocatore lo ottiene; i contesi finiscono in asta live.
- [ ] Il manager vede i propri esiti su `/buste` e **non** vede quelli altrui.

---

## 5. Sicurezza

- [ ] `/api/magic?email=superadmin@fantacalcio.local` → deve rispondere **404** (endpoint disattivato).
- [ ] Da manager, apri `/admin/asta` e `/admin/riepilogo` → nessun contenuto.
- [ ] Nella SQL Editor di Supabase: `SELECT public.make_me_super_admin();` → deve dare *function does not exist*.

---

## 6. La prova del nove

- [ ] `/admin/setup` → **HARD RESET LEGA**, scrivi `CONFERMO`.
- [ ] Rifai il login come super admin: **il ruolo deve essere ancora SUPER_ADMIN**.

  > È esattamente ciò che si rompeva e che aveva prodotto i sei script di ripristino.

⚠️ Il reset cancella squadre, giocatori e gli altri account. Falla per ultima, e solo se sei disposto a rifare gli import.

---

## Se qualcosa non torna

- Errori del database: Supabase → *Logs → Postgres*.
- Errori dell'app: console del browser e terminale di `npm run dev`.
- Stato delle migration: `npx supabase migration list` (le due colonne devono coincidere).
- Manutenzione: se i contatori slot si disallineano, `/admin/setup` → **Ricalcola slot occupati**.
