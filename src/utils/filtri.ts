import { ruoloCorrisponde } from '@/utils/ruoli'

/**
 * Il filtro dei giocatori, in un posto solo.
 *
 * Era scritto tre volte — in /svincolati, in /buste e nel costruttore di
 * offerta — e le tre copie erano già divergenti. In /buste il controllo sui
 * ruoli Mantra c'era ma era codice morto: la tendina accanto offriva soltanto
 * P, D, C e A, quindi quel ramo non poteva scattare. Nessuno se n'era accorto
 * perché le tre pagine si guardano in momenti diversi della stagione.
 */

export type GiocatoreFiltrabile = {
  nome: string
  ruolo?: string | null
  squadra?: string | null
  ruolo_mantra?: string[] | null
}

/**
 * La ricerca libera cerca nel nome del calciatore e nella squadra reale.
 * Entrambi, perché "Milan" è una domanda legittima quanto "Leao".
 */
export function testoCorrisponde(g: GiocatoreFiltrabile, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  return g.nome.toLowerCase().includes(q) || (g.squadra ?? '').toLowerCase().includes(q)
}

/** Ricerca libera e filtro ruolo insieme: valgono entrambi, non l'ultimo. */
export function passaFiltri(g: GiocatoreFiltrabile, query: string, ruolo: string): boolean {
  return testoCorrisponde(g, query) && ruoloCorrisponde(ruolo, g.ruolo, g.ruolo_mantra)
}
