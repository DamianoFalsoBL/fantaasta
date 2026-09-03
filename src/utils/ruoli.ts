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

/**
 * Ruoli Mantra nell'ordine della leggenda ufficiale Mantra, dalla porta
 * all'attacco: portiere, linea difensiva, centrocampo, trequarti, attacco.
 *
 * L'ordine non e' inventato ne' alfabetico, ed e' cambiato il 29 agosto per
 * combaciare con la leggenda: prima diceva Dc, B, Dd, Ds e T prima di W.
 * Serve in due posti — le voci del filtro e l'ordine delle rose — e devono
 * essere lo stesso, altrimenti la tendina dice una cosa e la lista un'altra.
 */
export const RUOLI_MANTRA = ['Por', 'Ds', 'Dc', 'Dd', 'B', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc']

/**
 * La posizione di un giocatore nell'ordine della leggenda.
 *
 * Con piu' ruoli si prende **il piu' arretrato**, cioe' l'indice piu' basso:
 * chi puo' fare Ds sta con i terzini sinistri anche se sa fare pure l'esterno.
 * Non si guarda il primo elemento dell'array, perche' il listone non li scrive
 * in quest'ordine — verificato: 36 giocatori su 549 li hanno in ordine diverso,
 * per esempio "B / Ds / E".
 *
 * Chi non ha ruoli Mantra finisce in fondo invece che in testa.
 */
export function indiceMantra(ruoli: string[] | null | undefined): number {
  if (!ruoli || ruoli.length === 0) return 99
  return ruoli.reduce((minimo, r) => {
    const i = RUOLI_MANTRA.findIndex((m) => m.toUpperCase() === r.toUpperCase())
    return i >= 0 && i < minimo ? i : minimo
  }, 99)
}

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
 *
 * **Accetta un ruolo solo o un elenco**, e con l'elenco vale «almeno uno»:
 * scegliendo Dc e Ds si vuole vedere chi puo' giocare in uno dei due, non chi
 * li ricopre entrambi. Un giocatore ha piu' ruoli Mantra, quindi l'incrocio
 * sarebbe quasi sempre vuoto e la funzione sembrerebbe rotta.
 *
 * La firma tiene tutti e due i casi di proposito: `passaFiltri` e' chiamata da
 * quattro pagine, e una di queste (/trasferimenti) si vede solo a mercato
 * aperto. Cambiare il tipo di colpo le avrebbe toccate tutte insieme, senza
 * poterne guardare una.
 */
export function ruoloCorrisponde(
  filtro: string | string[],
  ruolo: string | null | undefined,
  mantra: string[] | null | undefined
): boolean {
  const scelti = (Array.isArray(filtro) ? filtro : [filtro]).filter(Boolean)
  if (scelti.length === 0) return true

  const elencoMantra = (mantra ?? []).map((m) => m.toUpperCase())

  return scelti.some((f) => {
    if (f.startsWith('cl:')) return ruolo === f.slice(3)
    if (f.startsWith('mn:')) return elencoMantra.includes(f.slice(3))
    return ruolo === f || elencoMantra.includes(f.toUpperCase())
  })
}
