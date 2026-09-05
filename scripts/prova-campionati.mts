/**
 * Ogni club del listone sa in che campionato gioca?
 *
 * node --experimental-strip-types scripts/prova-campionati.mts
 *
 * Serve per la stessa ragione della prova degli stemmi: **un club senza
 * campionato non somiglia a un guasto**. La riga si disegna lo stesso e
 * sparisce solo quando qualcuno accende il filtro — cioe' si scopre in asta,
 * cercando un giocatore che c'e' e non si vede.
 *
 * Le squadre si leggono dal database e non da un elenco scritto qui: conta
 * come le scrive il listone davvero importato, non come si chiamano.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { CAMPIONATI, campionatoDi, nomeCampionato, type Campionato } from '../src/utils/campionati.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

const { data, error } = await db.from('giocatori').select('nome, squadra')
if (error) { console.log('errore:', error.message); process.exit(1) }
const giocatori = data ?? []

const club = [...new Set(giocatori.map((g) => g.squadra))].sort((a, b) => a.localeCompare(b, 'it'))
console.log(`${giocatori.length} giocatori, ${club.length} club nel listone\n`)

const orfani = club.filter((c) => campionatoDi(c) === null)

const perLega = new Map<Campionato, string[]>()
for (const c of club) {
  const lega = campionatoDi(c)
  if (!lega) continue
  perLega.set(lega, [...(perLega.get(lega) ?? []), c])
}

for (const { id } of CAMPIONATI) {
  const suoi = perLega.get(id) ?? []
  const quanti = giocatori.filter((g) => campionatoDi(g.squadra) === id).length
  console.log(`${nomeCampionato(id).padEnd(16)} ${String(suoi.length).padStart(2)} club, ${String(quanti).padStart(3)} giocatori`)
  console.log(`                 ${suoi.join(', ')}`)
}

// Somma di controllo: nessun giocatore deve restare fuori da tutti i filtri.
const coperti = giocatori.filter((g) => campionatoDi(g.squadra) !== null).length
console.log(`\ncoperti ${coperti} giocatori su ${giocatori.length}`)

if (orfani.length > 0) {
  console.log(`\nKO — ${orfani.length} club senza campionato: ${orfani.join(', ')}`)
  console.log('Vanno aggiunti a CLUB_PER_CAMPIONATO in src/utils/campionati.ts.')
  process.exit(1)
}
console.log('\nok  tutti i club del listone hanno il loro campionato.')
