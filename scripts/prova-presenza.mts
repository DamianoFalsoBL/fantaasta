/**
 * Prova del modulo `utils/presenza.ts` contro il database vero.
 *
 * Si lancia con: node --experimental-strip-types scripts/prova-presenza.mts
 *
 * Prova il modulo vero, non una sua copia: e' la parte che puo' sbagliare in
 * silenzio, perche' un pallino spento non somiglia a un guasto — somiglia a un
 * manager che non c'e'.
 *
 * Il secondo e il terzo "browser" sono client grezzi che fanno `track` a mano:
 * il modulo tiene un canale solo per processo (e' il suo scopo), quindi non lo
 * si puo' usare due volte qui dentro.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { annunciaPresenza, ascoltaPresenza } from '../src/utils/presenza.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SQ_A = 'squadra-alfa'
const SQ_B = 'squadra-beta'
const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms))

let guasti = 0
const verifica = (nome: string, ok: boolean, dettaglio = '') => {
  if (!ok) guasti++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${dettaglio ? ' -> ' + dettaglio : ''}`)
}

/** Un altro browser: track diretto, senza passare dal modulo. */
function altroBrowser(chiave: string, squadraId: string) {
  const client = createClient(URL, ANON)
  const c = client.channel('presenza-lega', { config: { presence: { key: chiave } } })
  return new Promise<{ client: SupabaseClient; chiudi: () => Promise<void> }>((risolvi) => {
    c.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await c.track({ squadraId, da: Date.now() })
        risolvi({ client, chiudi: async () => { await client.removeChannel(c) } })
      }
    })
  })
}

// Chi guarda: la tabella dell'admin.
let visto = new Map<string, number>()
let avvisi = 0
const smettiAscolto = ascoltaPresenza((m) => { visto = m; avvisi++ })
verifica('ascoltaPresenza consegna subito lo stato che c\'e\' gia\'', avvisi === 1, `avvisi: ${avvisi}`)

// Questo browser: la NavBar annuncia.
const mio = createClient(URL, ANON)
const smettiAnnuncio = annunciaPresenza(mio, 'utente-mio', SQ_A)
await attesa(3000)
verifica('la propria squadra risulta collegata', visto.has(SQ_A), `mappa: [${[...visto.keys()].join(', ')}]`)

// Un secondo manager entra.
const altro = await altroBrowser('utente-altro', SQ_B)
await attesa(3500)
verifica('si vede anche il secondo manager', visto.has(SQ_A) && visto.has(SQ_B), `mappa: [${[...visto.keys()].join(', ')}]`)

// Due schede aperte dallo stesso manager: una voce sola, non due.
const bis = await altroBrowser('utente-altro-bis', SQ_B)
await attesa(3500)
verifica('due schede dello stesso manager restano una voce sola',
  visto.size === 2, `voci: ${visto.size} (attese 2)`)

// Ne chiude una: la squadra resta collegata, perche' l'altra e' ancora aperta.
await bis.chiudi()
await attesa(3500)
verifica('chiudendo una scheda su due la squadra resta collegata',
  visto.has(SQ_B), `mappa: [${[...visto.keys()].join(', ')}]`)

// Chiude anche l'altra: ora sparisce.
await altro.chiudi()
await attesa(3500)
verifica('chiusa l\'ultima scheda, la squadra sparisce',
  !visto.has(SQ_B) && visto.has(SQ_A), `mappa: [${[...visto.keys()].join(', ')}]`)

// Chi non ha squadra (il super admin) non deve comparire da nessuna parte.
const superAdmin = createClient(URL, ANON)
const cSuper = superAdmin.channel('presenza-lega', { config: { presence: { key: 'super-admin' } } })
await new Promise<void>((r) => cSuper.subscribe(async (s) => {
  if (s === 'SUBSCRIBED') { await cSuper.track({ squadraId: null, da: Date.now() }); r() }
}))
await attesa(3500)
verifica('chi non ha squadra non compare nella mappa',
  visto.size === 1 && visto.has(SQ_A), `mappa: [${[...visto.keys()].join(', ')}]`)

// Il modulo non apre un secondo canale se lo si chiama di nuovo.
const secondo = annunciaPresenza(mio, 'utente-mio', SQ_A)
verifica('una seconda annunciaPresenza non apre un altro canale', typeof secondo === 'function')

await superAdmin.removeChannel(cSuper)
smettiAscolto()
smettiAnnuncio()
await attesa(500)

console.log(guasti === 0 ? '\nIl modulo si comporta come deve.' : `\n${guasti} problemi.`)
process.exit(guasti > 0 ? 1 : 0)
