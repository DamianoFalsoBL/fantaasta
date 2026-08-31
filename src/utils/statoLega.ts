/**
 * La riga di stato: «a che punto siamo».
 *
 * Durante l'asta chi non sta guardando /asta non sa cosa stia succedendo, e la
 * domanda che gira a voce — «a che punto siamo?», «tocca a me?» — non aveva una
 * risposta scritta da nessuna parte del sito. Questa funzione la scrive.
 *
 * Sta qui e non dentro il componente perché **è la parte che può dire il
 * falso**: un «Tocca a te» mostrato a chi non è di turno è peggio di nessuna
 * riga, perché fa premere pulsanti che il server rifiuterà. Come funzione pura
 * si prova davvero, con tutti i rami e con i casi limite che a mano non si
 * incontrano mai (ordine vuoto, indice fuori scala, squadra sparita dalla
 * mappa dei nomi).
 *
 * Stesso schema di `scegliDaiPreferiti` in `preferiti.ts` e di
 * `ETICHETTA_STATO` in `trasferimenti.ts`.
 *
 * **Niente orologio qui dentro.** `adesso` arriva da fuori: leggere `Date.now()`
 * renderebbe il risultato diverso a ogni chiamata e la funzione non sarebbe più
 * provabile senza falsificare il tempo. Per lo stesso motivo il conto alla
 * rovescia non entra nel testo: la riga espone `scadenza` e i secondi li appende
 * il componente, che è l'unico a doversi ridisegnare ogni secondo.
 */

export type TonoStato =
  /** Non c'è niente da fare, si guarda. */
  | 'neutro'
  /** Si aspetta qualcun altro (l'admin, gli altri manager). */
  | 'attesa'
  /** Tocca a chi legge. */
  | 'azione'
  /** Asta viva, il tempo scorre. */
  | 'vivo'
  /** È appena successo qualcosa. */
  | 'fatto'

/** L'asta aperta in questo momento: solo CHIAMATA o IN_CORSO. */
export type AstaCorrente = {
  stato: 'CHIAMATA' | 'IN_CORSO'
  giocatore: string
  prezzo: number
  /** Id della squadra in testa, non il nome: i nomi stanno in `nomiSquadre`. */
  squadraInTesta: string | null
  /** ISO, come arriva da Postgres. `null` finché l'admin non avvia il timer. */
  scadenza: string | null
}

/**
 * Un fatto appena avvenuto, che il componente tiene acceso una ventina di
 * secondi.
 *
 * Serve perché **l'aggiudicazione non è uno stato**: `chiudi_asta` assegna il
 * giocatore e nello stesso istante fa avanzare il turno, quindi una riga che
 * dicesse soltanto «dove siamo adesso» passerebbe da «asta in corso» a «tocca a
 * X» senza mai nominare chi ha vinto.
 */
export type Annuncio =
  | { tipo: 'aggiudicato'; giocatore: string; squadra: string | null; prezzo: number }
  /** chiudi_asta chiude senza assegnare se la rosa o il ruolo sono pieni. */
  | { tipo: 'non-assegnato'; giocatore: string }
  | { tipo: 'sorteggio' }

export type FotoLega = {
  /** `regole_lega.ordine_chiamata`, gli id in ordine di chiamata. */
  ordineChiamata: string[]
  /** `regole_lega.indice_chiamata`, **1-based** come a database. */
  indiceChiamata: number
  faseBusteAperta: boolean
  asta: AstaCorrente | null
  annuncio: Annuncio | null
  /** `null` per il super admin, che non gioca. */
  miaSquadraId: string | null
  nomiSquadre: Record<string, string>
  /** Slot ancora liberi nella propria rosa; `null` se non si ha una squadra. */
  slotLiberi: number | null
  /** Vero se la propria busta del turno corrente è già stata consegnata. */
  bustaConsegnata: boolean
  /**
   * Chi ha ancora qualcuno da chiamare, con lo stesso criterio di
   * `avanza_turno_chiamata()`: rosa non completa **e** almeno un giocatore
   * ancora libero nella propria lista.
   *
   * `null` quando non è stato letto (durante un'asta non serve): in quel caso
   * il «poi tocca a…» viene omesso invece di essere indovinato. Un prossimo
   * turno sbagliato è esattamente il tipo di dettaglio che nessuno verifica e
   * tutti ricordano.
   */
  squadreAttive: Set<string> | null
  /** Millisecondi, da fuori. Vedi la nota in testa al file. */
  adesso: number
}

export type RigaStato = {
  testo: string
  tono: TonoStato
  href: string
  /** L'ordine di chiamata per esteso, già in nomi. Vuoto se non serve. */
  dettaglio: string[]
  /** Valorizzata solo con l'asta viva: il componente ci appende i secondi. */
  scadenza: string | null
}

const plurale = (n: number, uno: string, molti: string) => (n === 1 ? uno : molti)

export function descriviStato(foto: FotoLega): RigaStato {
  const {
    ordineChiamata, indiceChiamata, faseBusteAperta, asta, annuncio,
    miaSquadraId, nomiSquadre, slotLiberi, bustaConsegnata, squadreAttive, adesso,
  } = foto

  /**
   * Il nome di una squadra, o `null` se non lo conosciamo.
   *
   * Restituire `undefined` e infilarlo in un template darebbe «Tocca a
   * undefined»: ogni chiamante deve decidere cosa dire quando il nome manca,
   * ed è per questo che il tipo di ritorno è nullabile.
   */
  const nome = (id: string | null | undefined): string | null =>
    id ? (nomiSquadre[id] ?? null) : null

  // ---------------------------------------------------------------- ANNUNCI
  // Scavalcano tutto: sono l'unica cosa che il resto della cascata non può
  // raccontare, perché lo stato a database è già andato oltre.
  if (annuncio) {
    if (annuncio.tipo === 'sorteggio') {
      return {
        testo: 'Ordine di chiamata sorteggiato',
        tono: 'fatto',
        href: '/asta',
        dettaglio: ordineChiamata.map((id) => nome(id) ?? '—'),
        scadenza: null,
      }
    }
    if (annuncio.tipo === 'non-assegnato') {
      return {
        testo: `${annuncio.giocatore}: asta chiusa senza assegnazione`,
        tono: 'fatto',
        href: '/asta',
        dettaglio: [],
        scadenza: null,
      }
    }
    const cr = `${annuncio.prezzo} ${plurale(annuncio.prezzo, 'credito', 'crediti')}`
    return {
      testo: annuncio.squadra
        ? `${annuncio.squadra} si aggiudica ${annuncio.giocatore} per ${cr}`
        : `${annuncio.giocatore} aggiudicato per ${cr}`,
      tono: 'fatto',
      href: '/asta',
      dettaglio: [],
      scadenza: null,
    }
  }

  // ------------------------------------------------------------ FASE BUSTE
  // Prima dell'asta a chiamata: finché le buste sono aperte non si chiama
  // nessuno, quindi qualunque cosa dicessimo sui turni sarebbe fuori tempo.
  if (faseBusteAperta) {
    if (miaSquadraId === null) {
      return { testo: 'Fase buste aperta', tono: 'neutro', href: '/buste', dettaglio: [], scadenza: null }
    }
    if (slotLiberi !== null && slotLiberi <= 0) {
      return { testo: 'Buste aperte · la tua rosa è completa', tono: 'neutro', href: '/buste', dettaglio: [], scadenza: null }
    }
    if (bustaConsegnata) {
      return { testo: 'Buste aperte · hai consegnato · si attendono gli altri', tono: 'attesa', href: '/buste', dettaglio: [], scadenza: null }
    }
    const quanti = slotLiberi ?? 0
    return {
      testo: quanti > 0
        ? `Buste aperte · devi consegnare ${quanti} ${plurale(quanti, 'giocatore', 'giocatori')}`
        : 'Buste aperte · devi consegnare la tua busta',
      tono: 'azione',
      href: '/buste',
      dettaglio: [],
      scadenza: null,
    }
  }

  // -------------------------------------------------------------- L'ASTA
  if (asta) {
    const inTesta = nome(asta.squadraInTesta)
    const suo = asta.squadraInTesta !== null && asta.squadraInTesta === miaSquadraId

    if (asta.stato === 'CHIAMATA') {
      const chi = suo ? 'Hai' : inTesta ? `${inTesta} ha` : 'Qualcuno ha'
      return {
        testo: `${chi} prenotato ${asta.giocatore} · si attende l'avvio dell'admin`,
        tono: 'attesa',
        href: '/asta',
        dettaglio: [],
        scadenza: null,
      }
    }

    // Il tempo scaduto non chiude l'asta: la riga resta IN_CORSO finché un
    // admin non preme «Chiudi asta e assegna». È uno stato che dura, e senza
    // questo ramo la barra continuerebbe a mostrare un timer fermo a zero.
    const scaduta = asta.scadenza !== null && new Date(asta.scadenza).getTime() <= adesso
    if (scaduta) {
      return {
        testo: inTesta
          ? `Asta finita: ${asta.giocatore} a ${inTesta} per ${asta.prezzo} cr · l'admin deve assegnare`
          : `Asta finita: ${asta.giocatore} · l'admin deve assegnare`,
        tono: 'attesa',
        href: '/asta',
        dettaglio: [],
        scadenza: null,
      }
    }

    return {
      testo: inTesta
        ? `${asta.giocatore} in asta · ${asta.prezzo} cr · ${inTesta}`
        : `${asta.giocatore} in asta · ${asta.prezzo} cr`,
      tono: 'vivo',
      href: '/asta',
      // Solo qui: con la scadenza ancora nulla (asta prenotata) non c'è nulla
      // da contare, e il ramo `scaduta` qui sopra è già uscito.
      scadenza: asta.scadenza,
      dettaglio: [],
    }
  }

  // ------------------------------------------------------ TURNI DI CHIAMATA
  if (ordineChiamata.length === 0) {
    return { testo: 'Ordine di chiamata da sorteggiare', tono: 'attesa', href: '/asta', dettaglio: [], scadenza: null }
  }

  // Nessuno ha più giocatori liberi da chiamare: l'asta a chiamata è finita.
  // `avanza_turno_chiamata()` non svuota l'ordine, quindi senza questo la barra
  // continuerebbe a indicare il turno di qualcuno per sempre.
  if (squadreAttive !== null && squadreAttive.size === 0) {
    return { testo: 'Aste a chiamata concluse', tono: 'neutro', href: '/aste', dettaglio: [], scadenza: null }
  }

  // L'indice è 1-based a database. Fuori scala non è un caso teorico: basta
  // che l'admin risorteggi l'ordine mentre la pagina è aperta.
  const idTurno = ordineChiamata[indiceChiamata - 1]
  const nomeTurno = nome(idTurno)
  const dettaglio = ordineChiamata.map((id) => nome(id) ?? '—')

  if (!idTurno) {
    return { testo: 'Aste a chiamata in corso', tono: 'neutro', href: '/asta', dettaglio, scadenza: null }
  }

  if (idTurno === miaSquadraId) {
    return { testo: 'Tocca a te: scegli chi chiamare', tono: 'azione', href: '/asta', dettaglio, scadenza: null }
  }

  const testoTurno = nomeTurno ? `Tocca a ${nomeTurno}` : "Tocca a un'altra squadra"
  const dopo = prossimoDiTurno(ordineChiamata, indiceChiamata, squadreAttive)
  const nomeDopo = dopo !== null ? nome(dopo) : null

  return {
    testo: nomeDopo ? `${testoTurno} · poi ${nomeDopo}` : testoTurno,
    tono: 'neutro',
    href: '/asta',
    dettaglio,
    scadenza: null,
  }
}

/**
 * Chi chiamerà dopo quello di turno.
 *
 * **Salta le squadre che non hanno più nulla da chiamare**, perché è quello che
 * fa `avanza_turno_chiamata()`: prendere semplicemente l'elemento successivo
 * dell'array darebbe un nome sbagliato ogni volta che qualcuno ha finito, e un
 * «poi tocca a X» falso è il genere di dettaglio che nessuno va a verificare.
 *
 * Senza `squadreAttive` non si indovina: si restituisce `null` e il chiamante
 * omette la seconda metà della frase.
 */
function prossimoDiTurno(
  ordine: string[],
  indice: number,
  attive: Set<string> | null
): string | null {
  if (attive === null || ordine.length < 2) return null
  const partenza = indice - 1
  for (let passo = 1; passo < ordine.length; passo++) {
    const candidato = ordine[(partenza + passo) % ordine.length]
    if (candidato && attive.has(candidato)) return candidato
  }
  return null
}
