/**
 * L'ordine del server e quello del client devono coincidere.
 *
 * Si lancia con: node --experimental-strip-types scripts/prova-ordine.mts
 *
 * E' la prova che serve davvero: se divergono, l'elenco si riordina da se' un
 * istante dopo il caricamento, sotto gli occhi di chi guarda. Non e' un difetto
 * che si nota leggendo il codice — si nota solo confrontando i due ordini sugli
 * stessi dati, che e' quello che fa questo script.
 *
 * Passando da 'nome' a 'quotazione' il rischio e' cresciuto molto: i nomi sono
 * quasi unici, le quotazioni pareggiano a decine.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { ordinaGiocatori } from '../src/utils/ordinamento.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

// Le stesse identiche interrogazioni di /svincolati e /buste.
const { data, error } = await db
  .from('giocatori')
  .select('*')
  .eq('stato', 'LIBERO')
  .eq('fuori_lista', false)
  .order('quotazione', { ascending: false })
  .order('nome')

if (error) { console.log('errore:', error.message); process.exit(1) }

const dalServer = data ?? []
console.log(`${dalServer.length} giocatori liberi letti dal database`)

// Quante quotazioni pareggiano: dice quanto contava il secondo criterio.
const perQuota = new Map<number, number>()
for (const g of dalServer) perQuota.set(g.quotazione, (perQuota.get(g.quotazione) ?? 0) + 1)
const pareggi = [...perQuota.entries()].filter(([, n]) => n > 1)
const inPareggio = pareggi.reduce((s, [, n]) => s + n, 0)
console.log(`quotazioni distinte: ${perQuota.size} · giocatori con una quotazione condivisa: ${inPareggio}`)
console.log(`il gruppo piu' numeroso: ${Math.max(...perQuota.values())} giocatori con la stessa quotazione`)

// Il client riordina gli stessi dati con la propria funzione.
const dalClient = ordinaGiocatori(dalServer, 'quotazione', 'desc')

const primoDiverso = dalServer.findIndex((g, i) => g.id !== dalClient[i]?.id)
if (primoDiverso === -1) {
  console.log('\nok  i due ordini coincidono riga per riga: la lista non si muove al ridisegno')
  console.log(`     primi cinque: ${dalServer.slice(0, 5).map((g) => `${g.nome} (${g.quotazione})`).join(', ')}`)
  process.exit(0)
}

console.log(`\nNO  divergono alla riga ${primoDiverso + 1}:`)
console.log(`     server: ${dalServer[primoDiverso].nome} (${dalServer[primoDiverso].quotazione})`)
console.log(`     client: ${dalClient[primoDiverso].nome} (${dalClient[primoDiverso].quotazione})`)
console.log('     => la lista si riordinerebbe da se\' dopo il caricamento')
process.exit(1)
