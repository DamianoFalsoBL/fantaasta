/**
 * L'ordinamento delle liste di giocatori, in un posto solo.
 *
 * Stava scritto per intero dentro /svincolati. Quando è servito anche in
 * /buste, copiarlo avrebbe creato la quarta copia divergente di una regola con
 * tre dettagli che nessuno riscriverebbe uguali a memoria: i valori mancanti in
 * fondo in entrambi i versi, il confronto per lingua italiana, e il pareggio
 * risolto sempre sul nome. È lo stesso motivo per cui esiste `filtri.ts`.
 */

export type ColonnaOrdine = 'nome' | 'ruolo' | 'squadra' | 'eta' | 'quotazione'
export type Verso = 'asc' | 'desc'

export type GiocatoreOrdinabile = {
  nome: string
  ruolo?: string | null
  squadra?: string | null
  eta?: number | null
  quotazione?: number | null
}

// I reparti si ordinano dalla porta all'attacco, non alfabeticamente: A, C, D, P
// non vuol dire niente per chi guarda una rosa.
const PESO_RUOLO: Record<string, number> = { P: 1, D: 2, C: 3, A: 4 }

/**
 * Le voci della tendina, identiche nelle pagine che la offrono: due elenchi
 * scritti a mano finirebbero per proporre ordini diversi con le stesse parole.
 * Il valore è `colonna:verso`, così una sola stringa basta a rappresentare lo
 * stato e a rileggerlo.
 */
export const OPZIONI_ORDINE: { valore: string; etichetta: string }[] = [
  { valore: 'nome:asc', etichetta: 'Nome A-Z' },
  { valore: 'nome:desc', etichetta: 'Nome Z-A' },
  { valore: 'squadra:asc', etichetta: 'Squadra A-Z' },
  { valore: 'squadra:desc', etichetta: 'Squadra Z-A' },
  { valore: 'ruolo:asc', etichetta: 'Reparto, dalla porta all’attacco' },
  { valore: 'eta:asc', etichetta: 'Età, dal più giovane' },
  { valore: 'eta:desc', etichetta: 'Età, dal più vecchio' },
  { valore: 'quotazione:desc', etichetta: 'Quotazione decrescente' },
  { valore: 'quotazione:asc', etichetta: 'Quotazione crescente' },
]

/** Restituisce una copia ordinata: non tocca l'array ricevuto. */
export function ordinaGiocatori<T extends GiocatoreOrdinabile>(
  lista: T[],
  colonna: ColonnaOrdine,
  verso: Verso,
): T[] {
  const segno = verso === 'asc' ? 1 : -1

  const chiave = (g: T): string | number | null => {
    if (colonna === 'nome') return g.nome ?? ''
    if (colonna === 'squadra') return g.squadra ?? ''
    if (colonna === 'ruolo') return PESO_RUOLO[g.ruolo ?? ''] ?? 99
    if (colonna === 'eta') return g.eta ?? null
    return g.quotazione ?? null
  }

  return [...lista].sort((a, b) => {
    const ka = chiave(a)
    const kb = chiave(b)

    // I valori mancanti restano in fondo in entrambi i versi: un'età ignota
    // non è né la più bassa né la più alta, e in cima darebbe fastidio due
    // volte su tre.
    if (ka === null && kb === null) return a.nome.localeCompare(b.nome, 'it')
    if (ka === null) return 1
    if (kb === null) return -1

    const confronto = typeof ka === 'string'
      ? ka.localeCompare(kb as string, 'it')
      : (ka as number) - (kb as number)

    // A parità, il nome: senza, righe identiche si riordinano a ogni ridisegno
    // e l'elenco sembra instabile. Non si moltiplica per il verso, così i
    // pareggi restano sempre in ordine alfabetico.
    return confronto === 0 ? a.nome.localeCompare(b.nome, 'it') : confronto * segno
  })
}
