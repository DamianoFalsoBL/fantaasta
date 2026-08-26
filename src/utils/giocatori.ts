// Chi è davvero prendibile, e chi solo sembra esserlo.

/**
 * Gli id dei giocatori già in coda per l'asta.
 *
 * Serve perché "libero" e "prendibile" non sono la stessa cosa: un giocatore
 * conteso entra in `liste_aste` quando si aprono le buste, ma la sua colonna
 * `stato` resta 'LIBERO' fino alla chiusura dell'asta, perché il tesseramento
 * avviene solo lì. Filtrare sul solo stato lo faceva comparire insieme fra i
 * "da assegnare" di /aste e fra gli svincolati.
 *
 * Non filtra sullo stato del giocatore, di proposito. `liste_aste` conserva le
 * righe anche dei giocatori poi tesserati — scelta deliberata di
 * 20260802160000_annulla_ripristina_lista.sql, che permette ad
 * `admin_annulla_acquisto` di ripristinare la contesa originale — ma entrambi i
 * chiamanti partono già da `stato = 'LIBERO'`, quindi quelle righe non tolgono
 * nulla e la funzione resta una cosa sola.
 *
 * Riceve il client invece di crearselo: la usano sia un componente server
 * (/svincolati) sia uno client (/buste). Stessa forma di `trasferimentiAttivi`
 * in `@/utils/trasferimenti`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function idsInCodaAsta(supabase: any): Promise<Set<number>> {
  const { data } = await supabase.from('liste_aste').select('giocatore_id')
  return new Set((data ?? []).map((r: { giocatore_id: number }) => r.giocatore_id))
}
