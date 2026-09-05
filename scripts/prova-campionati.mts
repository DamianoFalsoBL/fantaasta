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
import { CAMPIONATI, campionatoCorrisponde, campionatoDi, nomeCampionato, type Campionato } from '../src/utils/campionati.ts'

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

// --- Il filtro a scelta multipla ------------------------------------------
//
// La regola e' «almeno uno», come per i ruoli: chiedere due campionati vuol
// dire vederli entrambi. Il caso da non sbagliare e' l'elenco vuoto, che deve
// far passare tutti e non nessuno — e' l'inciampo speculare a quello del
// contatore dei filtri, dove un array vuoto truthy diceva «1 filtro attivo».
let ko = 0
const controlla = (nome: string, atteso: unknown, ottenuto: unknown) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto)
  if (!ok) { ko++; console.log(`  KO  ${nome}: atteso ${JSON.stringify(atteso)}, ottenuto ${JSON.stringify(ottenuto)}`) }
  else console.log(`  ok  ${nome}`)
}

console.log('')
console.log('Filtro a scelta multipla:')
const conta = (scelti: string[]) => giocatori.filter((g) => campionatoCorrisponde(g.squadra, scelti)).length
const soloA = giocatori.filter((g) => campionatoDi(g.squadra) === 'serie-a').length
const soloP = giocatori.filter((g) => campionatoDi(g.squadra) === 'premier').length

controlla('elenco vuoto: passano tutti', giocatori.length, conta([]))
controlla('un campionato solo', soloA, conta(['serie-a']))
controlla('due insieme sommano, non intersecano', soloA + soloP, conta(['serie-a', 'premier']))
controlla('tutti e cinque = tutti', giocatori.length, conta(CAMPIONATI.map((c) => c.id)))
controlla('stringa singola, come prima', soloA, giocatori.filter((g) => campionatoCorrisponde(g.squadra, 'serie-a')).length)
controlla('stringa vuota: passano tutti', giocatori.length, giocatori.filter((g) => campionatoCorrisponde(g.squadra, '')).length)
controlla("un club fuori da ogni elenco non passa mai", false, campionatoCorrisponde('Squadra Inventata', ['serie-a', 'premier']))

if (ko > 0) { console.log(''); console.log(`KO — ${ko} controlli falliti sul filtro.`); process.exit(1) }

if (orfani.length > 0) {
  console.log(`\nKO — ${orfani.length} club senza campionato: ${orfani.join(', ')}`)
  console.log('Vanno aggiunti a CLUB_PER_CAMPIONATO in src/utils/campionati.ts.')
  process.exit(1)
}
console.log('\nok  tutti i club del listone hanno il loro campionato.')
