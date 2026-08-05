/**
 * Ordinamento e confronto dei ruoli nei filtri.
 *
 * I filtri costruivano l'elenco dai dati e lo ordinavano alfabeticamente, con
 * due conseguenze:
 *
 * 1. i due sistemi si mescolavano — "A" (attaccante classico) finiva fra "B"
 *    (braccetto Mantra) e "C", e leggendo la tendina non si capiva più quale
 *    fosse il reparto e quale il ruolo di campo;
 * 2. "C" e "A" esistono in entrambi i sistemi con significati diversi
 *    (centrocampista / centrale, attaccante / ala accentrata), ma la voce era
 *    una sola e filtrava su entrambi insieme.
 *
 * Qui i due gruppi restano separati, nell'ordine del campo, e il valore porta
 * un prefisso che dice a quale sistema appartiene.
 */

export type OpzioneRuolo = { valore: string; etichetta: string }

/** I quattro reparti, dalla porta all'attacco. */
export const RUOLI_CLASSICI: OpzioneRuolo[] = [
  { valore: 'cl:P', etichetta: 'Portieri (P)' },
  { valore: 'cl:D', etichetta: 'Difensori (D)' },
  { valore: 'cl:C', etichetta: 'Centrocampisti (C)' },
  { valore: 'cl:A', etichetta: 'Attaccanti (A)' },
]

/** Ruoli Mantra nell'ordine di campo, non in quello alfabetico. */
export const RUOLI_MANTRA = ['Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

/**
 * Le voci Mantra da mostrare, limitate a quelle davvero presenti nei dati.
 *
 * Un ruolo non previsto dall'elenco (listone di un'altra stagione, refuso in
 * import) finisce in fondo invece di sparire dal filtro.
 */
export function opzioniMantra(presenti: Set<string>): OpzioneRuolo[] {
  const noti = RUOLI_MANTRA
    .filter((r) => presenti.has(r.toUpperCase()))
    .map((r) => ({ valore: `mn:${r.toUpperCase()}`, etichetta: r }))

  const imprevisti = [...presenti]
    .filter((p) => !RUOLI_MANTRA.some((r) => r.toUpperCase() === p))
    .sort()
    .map((r) => ({ valore: `mn:${r}`, etichetta: r }))

  return [...noti, ...imprevisti]
}

/** Raccoglie i ruoli Mantra presenti in una lista di giocatori. */
export function mantraPresenti(giocatori: { ruolo_mantra?: string[] | null }[]): Set<string> {
  const s = new Set<string>()
  giocatori.forEach((g) => g.ruolo_mantra?.forEach((m) => s.add(m.toUpperCase())))
  return s
}

/**
 * Un giocatore passa il filtro?
 *
 * Accetta anche un valore senza prefisso: sono i link o i preferiti salvati
 * prima di questa modifica, che altrimenti smetterebbero di filtrare.
 */
export function ruoloCorrisponde(
  filtro: string,
  ruolo: string | null | undefined,
  mantra: string[] | null | undefined
): boolean {
  if (!filtro) return true

  const elencoMantra = (mantra ?? []).map((m) => m.toUpperCase())

  if (filtro.startsWith('cl:')) return ruolo === filtro.slice(3)
  if (filtro.startsWith('mn:')) return elencoMantra.includes(filtro.slice(3))

  return ruolo === filtro || elencoMantra.includes(filtro.toUpperCase())
}
