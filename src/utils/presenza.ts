import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

/**
 * Chi è collegato in questo momento, con Supabase Presence.
 *
 * Nessuna tabella e nessuna scrittura: chi ha il sito aperto si annuncia su un
 * canale, e sparisce da sé quando chiude la scheda o cade la rete. Le
 * alternative erano peggiori in tutto: `last_sign_in_at` dice quando è entrato
 * l'ultima volta e non se c'è adesso, e una colonna `ultimo_visto` aggiornata a
 * intervalli vorrebbe una migration più una scrittura periodica da ogni browser
 * aperto.
 *
 * ## Perché il canale sta qui e non nei componenti
 *
 * **`supabase.channel(topic)` chiamato due volte restituisce lo stesso
 * oggetto**, e Realtime rifiuta di aggiungere ascoltatori dopo `subscribe()`
 * («cannot add presence callbacks after subscribe»). Misurato, non dedotto: il
 * primo tentativo prevedeva un canale nella NavBar che annuncia e uno nella
 * pagina admin che ascolta, ed è morto esattamente lì — su `/admin/riepilogo`
 * sono montati tutti e due nello stesso browser.
 *
 * Quindi il canale è **uno solo**, vive in questo modulo, registra l'ascolto
 * prima di sottoscriversi, e distribuisce lo stato a chi lo chiede. Chi annuncia
 * (la NavBar, che sta su ogni pagina) e chi guarda (la tabella dell'admin) usano
 * lo stesso.
 *
 * ## Cosa vuol dire «collegato»
 *
 * Che ha il sito aperto, **non** che lo sta guardando: una scheda dimenticata
 * aperta risulta collegata. Serve a sapere chi manca all'appello prima di
 * aprire o chiudere una fase, non a dedurre chi sta compilando.
 *
 * Il topic è **fisso**, al contrario di tutti gli altri canali del progetto che
 * finiscono con `-${Date.now()}` per non collidere: qui la collisione è il
 * punto, perché tutti devono trovarsi nello stesso posto.
 */

const TOPIC = 'presenza-lega'

/** Cosa ogni client racconta di sé. Il minimo che serve alla tabella. */
type Annuncio = { squadraId: string | null; da: number }

let canale: RealtimeChannel | null = null
let ultimoStato: Map<string, number> = new Map()
const ascoltatori = new Set<(collegati: Map<string, number>) => void>()

/** Ricava «squadra → da quando è collegata» dallo stato grezzo di Presence. */
function leggiStato(c: RealtimeChannel): Map<string, number> {
  const perSquadra = new Map<string, number>()
  const stato = c.presenceState<Annuncio>()

  for (const elementi of Object.values(stato)) {
    for (const e of elementi) {
      if (!e.squadraId) continue
      // Due schede aperte dallo stesso manager danno due elementi: vale la più
      // vecchia, cioè da quando è collegato davvero.
      const gia = perSquadra.get(e.squadraId)
      if (gia === undefined || e.da < gia) perSquadra.set(e.squadraId, e.da)
    }
  }
  return perSquadra
}

function avvisa() {
  for (const cb of ascoltatori) cb(ultimoStato)
}

/**
 * Annuncia che questo browser è collegato, e tiene aperto il canale.
 *
 * La chiama la NavBar, che è l'unico componente montato su ogni pagina.
 * Restituisce la funzione per smettere.
 *
 * `chiave` è l'id dell'utente e non quello della squadra: due manager della
 * stessa squadra — un caso che questa lega non ha ma che il modello dati
 * consente — devono contare come due presenze, altrimenti l'uscita del primo
 * spegnerebbe il pallino anche per il secondo.
 */
export function annunciaPresenza(
  supabase: SupabaseClient,
  chiave: string,
  squadraId: string | null
): () => void {
  if (canale) return () => {}

  const c = supabase.channel(TOPIC, { config: { presence: { key: chiave } } })
  canale = c

  // Prima di `subscribe`, sempre: dopo, Realtime li rifiuta.
  c.on('presence', { event: 'sync' }, () => {
    ultimoStato = leggiStato(c)
    avvisa()
  })

  c.subscribe((stato, err) => {
    if (stato === 'SUBSCRIBED') {
      void c.track({ squadraId, da: Date.now() } satisfies Annuncio)
    } else if (stato === 'CHANNEL_ERROR' || stato === 'TIMED_OUT') {
      console.warn('[presenza] canale in stato', stato, err)
    }
  })

  return () => {
    if (canale === c) {
      canale = null
      ultimoStato = new Map()
      void supabase.removeChannel(c)
    }
  }
}

/**
 * Si mette in ascolto di chi è collegato.
 *
 * La chiama la tabella dell'admin. Riceve subito lo stato che c'è già — la
 * pagina si monta dopo la NavBar, quindi il primo `sync` è probabilmente già
 * passato e senza questo la tabella resterebbe vuota fino al successivo.
 */
export function ascoltaPresenza(cb: (collegati: Map<string, number>) => void): () => void {
  ascoltatori.add(cb)
  cb(ultimoStato)
  return () => { ascoltatori.delete(cb) }
}
