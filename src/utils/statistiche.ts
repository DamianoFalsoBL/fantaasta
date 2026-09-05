/**
 * I conti della pagina Statistiche, in una funzione pura.
 *
 * Sta fuori dalla pagina per una ragione precisa: questi numeri si possono
 * sbagliare senza che si veda. Una media resta plausibile anche quando somma
 * cose diverse fra loro, e nessuno se ne accorge guardandola. Qui si possono
 * far girare sui dati veri con uno script e confrontarli con il database.
 *
 * ## La distinzione che regge tutta la pagina
 *
 * In `tesseramenti.prezzo_pagato` finiscono **due cose diverse**:
 *
 * - per chi è stato preso in questa asta, il prezzo vero battuto — lo scrive
 *   `chiudi_asta`, oppure la quotazione per chi è passato dalle buste;
 * - per chi è arrivato con l'import delle rose, la colonna "Costo" del file
 *   (`20260802100000_fix_import_listone.sql:87-92`), che è un valore deciso
 *   altrove e nella lega di oggi coincide quasi sempre con la quotazione.
 *
 * Mediarli insieme dà un numero che **sembra** una spesa e non lo è: nella
 * lega attuale sono 350 righe di listino contro 70 di asta vera, quindi il
 * risultato racconta il listone, non il mercato. Per questo `spesoInAsta`
 * conta **solo** i giocatori presi in questa asta, e la media di lega non
 * mescola mai i due insiemi.
 *
 * Chi è "preso in questa asta" non si decide dalla data di creazione della
 * riga — un confine temporale scritto a mano è un'ipotesi, non un dato — ma
 * dalla storia vera: le aste chiuse e le buste vinte. È lo stesso insieme che
 * `/rose` chiama `giocatoriRiparazione` e usa per evidenziare i prezzi.
 */

export type GiocatoreInRosa = {
  id: number
  nome: string
  eta: number | null
  ruolo: string
  quotazione: number
  prezzoPagato: number
  squadraId: string
  /** Preso in questa asta (asta chiusa o busta vinta), non arrivato con l'import. */
  presoInAsta: boolean
}

export type SquadraBase = {
  id: string
  nome: string
  budgetIniziale: number
  creditiResidui: number
}

export type RigaSquadra = {
  id: string
  nome: string
  giocatori: number
  etaMedia: number | null
  etaMin: number | null
  etaMax: number | null
  quotMedia: number | null
  quotTotale: number
  presiInAsta: number
  spesoInAsta: number
  /** Media per acquisto, sui soli giocatori presi in asta. */
  mediaAsta: number | null
  /** Speso diviso la quotazione degli stessi giocatori: 1 = pagati a listino. */
  rapportoListino: number | null
  creditiResidui: number
  /**
   * `budget_iniziale - crediti_residui` deve fare `spesoInAsta`: il budget è
   * già al netto delle rose importate, quindi copre solo la spesa dell'asta.
   * Se i due numeri divergono qualcosa non torna, e va detto invece che
   * mostrato come se niente fosse.
   */
  quadra: boolean
}

export type RigaRuolo = {
  ruolo: string
  inRosa: number
  quotMedia: number
  presiInAsta: number
  prezzoMedioAsta: number | null
  rapportoListino: number | null
}

export type Totali = {
  giocatori: number
  etaMedia: number | null
  quotMedia: number
  presiInAsta: number
  spesoInAsta: number
  mediaAsta: number | null
  rapportoListino: number | null
  /** Quanti sono arrivati con l'import invece che dall'asta. */
  importati: number
}

/** Media di un elenco di numeri; `null` se l'elenco è vuoto. */
function media(valori: number[]): number | null {
  return valori.length ? valori.reduce((s, v) => s + v, 0) / valori.length : null
}

export function riassumiSquadre(squadre: SquadraBase[], rosa: GiocatoreInRosa[]): RigaSquadra[] {
  const perSquadra = new Map<string, GiocatoreInRosa[]>()
  for (const g of rosa) {
    const elenco = perSquadra.get(g.squadraId)
    if (elenco) elenco.push(g)
    else perSquadra.set(g.squadraId, [g])
  }

  return squadre.map((s) => {
    const suoi = perSquadra.get(s.id) ?? []
    // Le età mancanti si escludono invece di contare come zero: un'età ignota
    // abbasserebbe la media di tutta la squadra senza che si veda perché.
    const conEta = suoi.filter((g) => g.eta !== null)
    const eta = conEta.map((g) => g.eta as number)
    const inAsta = suoi.filter((g) => g.presoInAsta)
    const speso = inAsta.reduce((t, g) => t + g.prezzoPagato, 0)
    const quotInAsta = inAsta.reduce((t, g) => t + g.quotazione, 0)

    return {
      id: s.id,
      nome: s.nome,
      giocatori: suoi.length,
      etaMedia: media(eta),
      etaMin: eta.length ? Math.min(...eta) : null,
      etaMax: eta.length ? Math.max(...eta) : null,
      quotMedia: media(suoi.map((g) => g.quotazione)),
      quotTotale: suoi.reduce((t, g) => t + g.quotazione, 0),
      presiInAsta: inAsta.length,
      spesoInAsta: speso,
      mediaAsta: inAsta.length ? speso / inAsta.length : null,
      // Zero quotazioni non è un rapporto di 0: è un rapporto che non esiste.
      rapportoListino: quotInAsta > 0 ? speso / quotInAsta : null,
      creditiResidui: s.creditiResidui,
      quadra: s.budgetIniziale - s.creditiResidui === speso,
    }
  })
}

/** I reparti dalla porta all'attacco, come ovunque nel sito. */
const ORDINE_RUOLI = ['P', 'D', 'C', 'A']

export function riassumiRuoli(rosa: GiocatoreInRosa[]): RigaRuolo[] {
  const perRuolo = new Map<string, GiocatoreInRosa[]>()
  for (const g of rosa) {
    const elenco = perRuolo.get(g.ruolo)
    if (elenco) elenco.push(g)
    else perRuolo.set(g.ruolo, [g])
  }

  return [...perRuolo.entries()]
    .sort((a, b) => {
      const pa = ORDINE_RUOLI.indexOf(a[0])
      const pb = ORDINE_RUOLI.indexOf(b[0])
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    })
    .map(([ruolo, elenco]) => {
      const inAsta = elenco.filter((g) => g.presoInAsta)
      const speso = inAsta.reduce((t, g) => t + g.prezzoPagato, 0)
      const quot = inAsta.reduce((t, g) => t + g.quotazione, 0)
      return {
        ruolo,
        inRosa: elenco.length,
        quotMedia: media(elenco.map((g) => g.quotazione)) ?? 0,
        presiInAsta: inAsta.length,
        prezzoMedioAsta: inAsta.length ? speso / inAsta.length : null,
        rapportoListino: quot > 0 ? speso / quot : null,
      }
    })
}

export function riassumiLega(rosa: GiocatoreInRosa[]): Totali {
  const eta = rosa.filter((g) => g.eta !== null).map((g) => g.eta as number)
  const inAsta = rosa.filter((g) => g.presoInAsta)
  const speso = inAsta.reduce((t, g) => t + g.prezzoPagato, 0)
  const quot = inAsta.reduce((t, g) => t + g.quotazione, 0)

  return {
    giocatori: rosa.length,
    etaMedia: media(eta),
    quotMedia: media(rosa.map((g) => g.quotazione)) ?? 0,
    presiInAsta: inAsta.length,
    spesoInAsta: speso,
    mediaAsta: inAsta.length ? speso / inAsta.length : null,
    rapportoListino: quot > 0 ? speso / quot : null,
    importati: rosa.length - inAsta.length,
  }
}

export type ColonnaStat =
  | 'nome' | 'eta' | 'quotazione' | 'spesa' | 'mediaAsta' | 'rapporto' | 'residui'

export const OPZIONI_STAT: { valore: string; etichetta: string }[] = [
  { valore: 'eta:asc', etichetta: 'Età media, dalla più giovane' },
  { valore: 'eta:desc', etichetta: 'Età media, dalla più anziana' },
  { valore: 'quotazione:desc', etichetta: 'Quotazione media, dalla più alta' },
  { valore: 'spesa:desc', etichetta: 'Crediti spesi in asta' },
  { valore: 'mediaAsta:desc', etichetta: 'Media per acquisto in asta' },
  { valore: 'rapporto:desc', etichetta: 'Quanto sopra il listino' },
  { valore: 'residui:desc', etichetta: 'Crediti residui' },
  { valore: 'nome:asc', etichetta: 'Nome A-Z' },
]

/** Copia ordinata. I valori mancanti restano in fondo in entrambi i versi. */
export function ordinaSquadre(
  righe: RigaSquadra[],
  colonna: ColonnaStat,
  verso: 'asc' | 'desc',
): RigaSquadra[] {
  const segno = verso === 'asc' ? 1 : -1

  const chiave = (r: RigaSquadra): number | string | null => {
    if (colonna === 'nome') return r.nome
    if (colonna === 'eta') return r.etaMedia
    if (colonna === 'quotazione') return r.quotMedia
    if (colonna === 'spesa') return r.spesoInAsta
    if (colonna === 'mediaAsta') return r.mediaAsta
    if (colonna === 'rapporto') return r.rapportoListino
    return r.creditiResidui
  }

  return [...righe].sort((a, b) => {
    const ka = chiave(a)
    const kb = chiave(b)
    if (ka === null && kb === null) return a.nome.localeCompare(b.nome, 'it')
    if (ka === null) return 1
    if (kb === null) return -1

    const confronto = typeof ka === 'string'
      ? ka.localeCompare(kb as string, 'it')
      : (ka as number) - (kb as number)

    // Il pareggio va sempre sul nome e non moltiplicato per il verso: senza,
    // due squadre con la stessa media si scambiano di posto a ogni ridisegno.
    return confronto === 0 ? a.nome.localeCompare(b.nome, 'it') : confronto * segno
  })
}
