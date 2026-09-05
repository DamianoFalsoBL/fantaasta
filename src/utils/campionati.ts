/**
 * A quale campionato appartiene un club.
 *
 * **Il dato non c'e' a database**: `giocatori` ha solo `squadra`, cioe' il
 * club. La mappa pero' esisteva gia' — implicita, a sezioni commentate, dentro
 * `LogoSquadra.tsx`, dove serviva solo a trovare il file dello stemma. Qui
 * viene resa esplicita, perche' un filtro non puo' leggere un commento.
 *
 * **Le chiavi sono i nomi che stanno nel listone, non quelli ufficiali.** Il
 * listone italiano traduce: «Bayern Monaco», «Lipsia», «Stoccarda»,
 * «Barcellona», «Olympique Marsiglia», «Racing Strasburgo». E' lo stesso
 * inciampo che il 2 settembre lasciava nove squadre su trentasette senza
 * stemma. Dove il nome italiano e quello inglese divergono ci sono due voci,
 * cosi' un listone scritto nell'altra lingua continua a funzionare.
 *
 * Chi aggiunge un club deve toccare **due posti**: qui e `FILE_PER_SQUADRA` in
 * `LogoSquadra.tsx`. Non sono stati unificati di proposito: sono due domande
 * diverse (in che campionato gioca / che file disegno), e un club puo' avere
 * risposta all'una e non all'altra — le neopromosse di Serie A stanno qui
 * anche quando lo stemma non e' ancora stato scaricato.
 */

export const CAMPIONATI = [
  { id: 'serie-a', nome: 'Serie A' },
  { id: 'premier', nome: 'Premier League' },
  { id: 'liga', nome: 'Liga' },
  { id: 'ligue-1', nome: 'Ligue 1' },
  { id: 'bundesliga', nome: 'Bundesliga' },
] as const

export type Campionato = (typeof CAMPIONATI)[number]['id']

/**
 * I club di ogni campionato, con la chiave gia' normalizzata.
 *
 * Scritti a elenco e non a coppie club->lega perche' cosi' si leggono come le
 * sezioni commentate da cui vengono, e aggiungere una squadra e' aggiungere
 * una riga nel posto giusto invece di cercarla in mezzo a settanta.
 */
const CLUB_PER_CAMPIONATO: Record<Campionato, string[]> = {
  'serie-a': [
    'atalanta', 'bologna', 'cagliari', 'como', 'fiorentina', 'frosinone',
    'genoa', 'inter', 'juventus', 'lazio', 'lecce', 'milan', 'monza',
    'napoli', 'parma', 'roma', 'sassuolo', 'torino', 'udinese', 'venezia',
  ],
  premier: [
    'arsenal', 'aston-villa', 'bournemouth', 'brighton', 'chelsea',
    'liverpool', 'manchester-city', 'manchester-united', 'newcastle',
    'tottenham',
  ],
  liga: [
    'athletic-bilbao', 'athletic-club', 'atletico-madrid', 'barcellona',
    'barcelona', 'betis', 'real-betis', 'real-madrid', 'villarreal',
  ],
  'ligue-1': [
    'marseille', 'olympique-marsiglia', 'monaco', 'paris-saint-germain',
    'racing-strasburgo', 'strasbourg', 'rennes',
  ],
  bundesliga: [
    'bayer-leverkusen', 'bayern-monaco', 'bayern-munchen',
    'borussia-dortmund', 'eintracht', 'eintracht-frankfurt', 'lipsia',
    'leipzig', 'rb-leipzig', 'stoccarda', 'stuttgart', 'vfb-stuttgart',
  ],
}

/** L'indice inverso, costruito una volta sola all'avvio. */
const CAMPIONATO_PER_CLUB: Record<string, Campionato> = Object.fromEntries(
  (Object.entries(CLUB_PER_CAMPIONATO) as [Campionato, string[]][])
    .flatMap(([lega, club]) => club.map((c) => [c, lega] as const)),
)

/**
 * Il nome del club ridotto alla forma delle chiavi.
 *
 * Identica alla riduzione di `LogoSquadra.tsx`, da cui e' stata spostata: due
 * copie che divergono vorrebbero dire uno stemma trovato e un campionato no,
 * sullo stesso club, senza che si capisca perche'.
 */
export function chiaveClub(squadra: string): string {
  return squadra
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // via gli accenti: münchen -> munchen
    .replace(/[\s_]+/g, '-')          // spazi e trattini bassi -> trattino
    .replace(/[^a-z0-9-]/g, '')       // via la punteggiatura: "St. Pauli" -> st-pauli
}

/** `null` per un club che non sta negli elenchi: non e' un errore, si filtra via. */
export function campionatoDi(squadra: string | null | undefined): Campionato | null {
  if (!squadra) return null
  return CAMPIONATO_PER_CLUB[chiaveClub(squadra)] ?? null
}

export function nomeCampionato(id: Campionato): string {
  return CAMPIONATI.find((c) => c.id === id)?.nome ?? id
}

/**
 * Il filtro. Elenco vuoto vuol dire «tutti», come per i ruoli.
 *
 * Accetta un valore solo o un elenco: con l'elenco basta che il club sia in
 * **uno** dei campionati scelti. Stessa regola di `ruoloCorrisponde`, ed e' la
 * ragione per cui la firma e' la stessa — chiedere «Premier e Bundesliga»
 * significa vederli entrambi, non l'intersezione, che sarebbe sempre vuota.
 *
 * Un club fuori elenco non passa mai un filtro attivo: e' l'unico
 * comportamento onesto, perche' dire di quale campionato sia sarebbe inventare.
 */
export function campionatoCorrisponde(
  squadra: string | null | undefined,
  filtro: string | string[],
): boolean {
  // `Array.isArray` e non un controllo di verita': un array vuoto e' truthy, ed
  // e' l'inciampo che il 4 settembre faceva contare «1 filtro attivo» per
  // sempre nel pannello dei filtri.
  const scelti = Array.isArray(filtro) ? filtro : filtro ? [filtro] : []
  if (scelti.length === 0) return true
  const lega = campionatoDi(squadra)
  return lega !== null && scelti.includes(lega)
}
