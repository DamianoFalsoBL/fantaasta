import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * I preferiti: la lista privata che ogni manager si prepara sfogliando gli
 * svincolati, e da cui poi si riempiono le buste.
 *
 * Le tre operazioni stanno qui e non sparse nelle pagine perché sono usate da
 * due posti — `/svincolati` che le scrive e `/buste` che le legge — e perché
 * l'**ordine** conta: il pulsante che riempie le buste sceglie i primi della
 * lista quando i preferiti sono più degli slot liberi. Se una delle due pagine
 * ordinasse diversamente, il manager vedrebbe entrare nomi che non si aspetta.
 *
 * La RLS fa il resto: `gestione_propri_preferiti` limita tutto alla propria
 * squadra, quindi qui non si filtra per `squadra_id` in lettura — sarebbe una
 * ripetizione che non protegge nulla in più e che, se un giorno divergesse
 * dalla policy, farebbe credere a una protezione che sta altrove.
 */

/** Gli id dei propri preferiti, dal più vecchio al più recente. */
export async function leggiPreferiti(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase
    .from('preferiti')
    .select('giocatore_id')
    .order('created_at')

  if (error) return []
  return (data ?? []).map((r: { giocatore_id: number }) => r.giocatore_id)
}

/**
 * Aggiunge un preferito.
 *
 * `squadra_id` va passato perché la policy lo confronta con `mia_squadra_id()`:
 * la RLS non lo riempie da sé, rifiuta e basta se non combacia.
 */
export async function aggiungiPreferito(
  supabase: SupabaseClient,
  squadraId: string,
  giocatoreId: number
): Promise<string | null> {
  const { error } = await supabase
    .from('preferiti')
    .insert({ squadra_id: squadraId, giocatore_id: giocatoreId })
  return error?.message ?? null
}

export async function togliPreferito(
  supabase: SupabaseClient,
  squadraId: string,
  giocatoreId: number
): Promise<string | null> {
  const { error } = await supabase
    .from('preferiti')
    .delete()
    .eq('squadra_id', squadraId)
    .eq('giocatore_id', giocatoreId)
  return error?.message ?? null
}
