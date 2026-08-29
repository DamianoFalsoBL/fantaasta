/**
 * Sonda API-Football: tre richieste che dicono se la scheda giocatore si può
 * fare davvero.
 *
 * Si esegue dalla radice del progetto:
 *
 *   node --experimental-strip-types scripts/sonda-api-football.mts
 *
 * Perché esiste: il piano gratuito dà 100 richieste al giorno e **limita le
 * stagioni accessibili in un modo che la documentazione pubblica non
 * specifica**. Se la stagione in corso non è compresa, la scheda mostrerebbe la
 * carriera di due anni fa e tutto il lavoro non ha senso. Meglio scoprirlo con
 * tre chiamate che dopo aver costruito tabella, sincronizzazione e interfaccia.
 *
 * Le tre chiamate rispondono a tre domande diverse:
 *   1. /status   — che piano abbiamo e quanta quota resta oggi
 *   2. /leagues  — quali stagioni di Serie A sono accessibili, e per quali
 *                  di esse la copertura include i giocatori
 *   3. /players  — la prova del nove: la stagione in corso torna gente vera?
 *
 * Dalla terza si ricava anche `paging.total`, cioè **quante pagine servono per
 * una squadra**: è il numero da cui dipende il costo dell'intera
 * sincronizzazione, e finora era una stima.
 *
 * Non stampa mai la chiave.
 */

import fs from 'node:fs'

const BASE = 'https://v3.football.api-sports.io'
const SERIE_A = 135
/** L'Inter. Un id qualsiasi di Serie A serve solo a vedere se torna roba. */
const SQUADRA_DI_PROVA = 505

/** La stagione in corso: da agosto in poi l'annata è quella dell'anno solare. */
const oggi = new Date()
const STAGIONE = oggi.getMonth() >= 6 ? oggi.getFullYear() : oggi.getFullYear() - 1

function leggiEnv(): Record<string, string> {
  if (!fs.existsSync('.env.local')) return {}
  return Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((r) => r.includes('=') && !r.trimStart().startsWith('#'))
      .map((r) => {
        const i = r.indexOf('=')
        return [r.slice(0, i).trim(), r.slice(i + 1).trim()]
      })
  )
}

const env = leggiEnv()
const CHIAVE = env.API_FOOTBALL_KEY ?? process.env.API_FOOTBALL_KEY

if (!CHIAVE) {
  console.log(`
Manca la chiave.

  1. Apri un account gratuito su https://dashboard.api-football.com/register
     (non chiede la carta di credito)
  2. Copia la chiave dalla sezione "My Access"
  3. Aggiungila in fondo a .env.local:

       API_FOOTBALL_KEY=la-tua-chiave

Poi rilancia questo comando. La chiave resta sul tuo computer: non va su
Vercel e il sito non la usa mai.
`)
  process.exit(1)
}

/** Una richiesta sola, con il conto di quelle spese. */
let spese = 0
async function chiama(percorso: string): Promise<any> {
  spese++
  const r = await fetch(`${BASE}${percorso}`, {
    headers: { 'x-apisports-key': CHIAVE as string },
  })
  const corpo = await r.json()
  return { http: r.status, corpo }
}

/** Gli errori arrivano dentro il corpo con HTTP 200: vanno guardati a mano. */
function erroriDi(corpo: any): string[] {
  const e = corpo?.errors
  if (!e) return []
  if (Array.isArray(e)) return e.map(String)
  return Object.entries(e).map(([k, v]) => `${k}: ${v}`)
}

console.log(`Sonda API-Football — stagione in corso: ${STAGIONE}\n`)

// ---------------------------------------------------------------- 1. /status
const stato = await chiama('/status')
const err1 = erroriDi(stato.corpo)
if (err1.length) {
  console.log('1. /status -> RIFIUTATO:', err1.join(' | '))
  console.log('\nSe dice che la chiave non è valida, ricontrolla di averla copiata per intero.')
  process.exit(1)
}
const s = stato.corpo?.response
console.log('1. Account')
console.log('   piano:      ', s?.subscription?.plan)
console.log('   attivo fino:', s?.subscription?.end)
console.log('   richieste:  ', `${s?.requests?.current} usate su ${s?.requests?.limit_day} al giorno`)

// -------------------------------------------------------- 2. /leagues (Serie A)
const leghe = await chiama(`/leagues?id=${SERIE_A}`)
const err2 = erroriDi(leghe.corpo)
console.log('\n2. Stagioni di Serie A accessibili')
if (err2.length) {
  console.log('   RIFIUTATO:', err2.join(' | '))
} else {
  const stagioni = leghe.corpo?.response?.[0]?.seasons ?? []
  if (stagioni.length === 0) console.log('   nessuna stagione restituita')
  for (const st of stagioni.slice(-8)) {
    const cop = st.coverage ?? {}
    console.log(
      `   ${st.year}`,
      st.current ? '(in corso)' : '         ',
      '| giocatori:', cop.players ? 'sì' : 'NO',
      '| statistiche giocatori:', cop.fixtures?.statistics_players ? 'sì' : 'no'
    )
  }
  const corrente = stagioni.find((x: any) => x.year === STAGIONE)
  console.log(
    corrente
      ? `\n   -> la stagione ${STAGIONE} c'è, copertura giocatori: ${corrente.coverage?.players ? 'SI' : 'NO'}`
      : `\n   -> la stagione ${STAGIONE} NON compare nell'elenco`
  )
}

// ------------------------------------------------- 3. /players (la prova del nove)
const rosa = await chiama(`/players?team=${SQUADRA_DI_PROVA}&season=${STAGIONE}&page=1`)
const err3 = erroriDi(rosa.corpo)
console.log(`\n3. Giocatori di una squadra nella stagione ${STAGIONE}`)
if (err3.length) {
  console.log('   RIFIUTATO:', err3.join(' | '))
} else {
  const risultati = rosa.corpo?.results ?? 0
  const pagine = rosa.corpo?.paging?.total ?? 0
  console.log('   giocatori in questa pagina:', risultati)
  console.log('   pagine totali per la squadra:', pagine)

  const primo = rosa.corpo?.response?.[0]
  if (primo) {
    const st = primo.statistics?.[0]
    console.log('   esempio:', primo.player?.name,
      `| ${primo.player?.age} anni | ${primo.player?.nationality}`,
      `| ${primo.player?.height ?? '—'} | foto: ${primo.player?.photo ? 'sì' : 'no'}`)
    console.log('   stagione:', st?.league?.name,
      `| presenze ${st?.games?.appearances ?? '—'}`,
      `| minuti ${st?.games?.minutes ?? '—'}`,
      `| gol ${st?.goals?.total ?? '—'}`,
      `| assist ${st?.goals?.assists ?? '—'}`,
      `| voto ${st?.games?.rating ?? '—'}`)
  }

  // Il costo vero della sincronizzazione, non piu' una stima.
  if (pagine > 0) {
    const costo = 1 + 20 * pagine
    console.log(`\n   -> una sincronizzazione completa costa ${costo} richieste`,
      `(1 per gli id squadra + 20 squadre x ${pagine} pagine)`)
    console.log(`      su 100 al giorno: ${costo <= 100 ? 'ci sta' : 'NON CI STA, va spezzata in piu giorni'}`)
    console.log(`      a 6,5 secondi l'una, dura circa ${Math.round(costo * 6.5 / 60)} minuti`)
  }
}

console.log(`\nRichieste spese da questa sonda: ${spese}`)
