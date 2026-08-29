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

/**
 * Sceglie quali preferiti aggiungere alla busta.
 *
 * Sta qui e non dentro la pagina perché è la parte che può dire il falso: se
 * il conteggio sbaglia, il manager legge «presi 10 su 14» e ne ha otto. Come
 * funzione pura si può provare davvero, con tutti i casi che contano.
 *
 * **Aggiunge, non sostituisce.** La prima versione rimpiazzava la selezione in
 * corso e chiedeva conferma prima di farlo: era il comportamento sbagliato con
 * un cerotto sopra. Chi ha già scelto due nomi a mano e preme "riempi" vuole
 * arrivare a dieci, non ricominciare da zero — e così sparisce anche la
 * domanda di conferma, perché non si distrugge più niente.
 *
 * `disponibili` sono i giocatori che la pagina ha già ripulito da chi non è
 * libero e da chi è in coda per l'asta: l'incrocio serve perché un preferito
 * segnato una settimana fa può essere stato preso da qualcun altro.
 *
 * L'ordine è quello di `idsPreferiti`, cioè quello di inserimento: quando i
 * preferiti sono più dei posti rimasti, entrano i primi che sono stati messi.
 */
export function scegliDaiPreferiti<T extends { id: number }>(
  idsPreferiti: number[],
  disponibili: T[],
  slotLiberi: number,
  giaSelezionati: number[] = []
): {
  daAggiungere: T[]
  giaPresenti: number
  nonDisponibili: number
  avanzati: number
  mancanti: number
} {
  const perId = new Map(disponibili.map((g) => [g.id, g]))
  const dentro = new Set(giaSelezionati)

  const trovati = idsPreferiti
    .map((id) => perId.get(id))
    .filter((g): g is T => g !== undefined)

  // Un preferito già selezionato non si conta né come aggiunto né come
  // avanzato: è dentro, e va detto a parte.
  const giaPresenti = trovati.filter((g) => dentro.has(g.id)).length
  const candidati = trovati.filter((g) => !dentro.has(g.id))

  const posti = Math.max(slotLiberi - giaSelezionati.length, 0)
  const daAggiungere = candidati.slice(0, posti)

  return {
    daAggiungere,
    giaPresenti,
    nonDisponibili: idsPreferiti.length - trovati.length,
    avanzati: candidati.length - daAggiungere.length,
    mancanti: Math.max(slotLiberi - giaSelezionati.length - daAggiungere.length, 0),
  }
}
