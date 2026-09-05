/**
 * Ogni squadra del listone ha il suo stemma?
 *
 * node scripts/prova-abbinamento-loghi.mjs
 *
 * Legge le squadre **dal database**, non da un elenco scritto qui: i nomi
 * plausibili non servono a niente: conta come li scrive il listone davvero
 * importato. Il listone italiano traduce — «Bayern Monaco», «Lipsia»,
 * «Stoccarda» — e su quello importato il 2 settembre nove squadre su
 * trentasette non trovavano lo stemma proprio per questo.
 *
 * Serve perche' **uno stemma mancante non somiglia a un guasto**: la riga si
 * disegna lo stesso, semplicemente senza immagine, e nessuno se ne accorge
 * finche' non la cerca.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)

// La stessa riduzione di `chiaveClub()` in src/utils/campionati.ts. Se una
// delle due cambia, questa prova smette di dire il vero: vanno tenute uguali.
const chiave = (s) => s.trim().toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')

// La mappa si legge dal sorgente invece di duplicarla: una copia diverge.
// Il confine e' la parentesi che chiude l'oggetto, non il commento che segue:
// agganciarsi a un commento vuol dire che riscriverlo (fatto il 5 settembre)
// fa restituire -1 a indexOf, e il blocco diventa il file intero senza che
// niente lo segnali.
const src = fs.readFileSync('src/components/LogoSquadra.tsx', 'utf8')
const inizio = src.indexOf('FILE_PER_SQUADRA')
const blocco = src.slice(inizio, src.indexOf('\n}', inizio))
const mappa = {}
for (const m of blocco.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'([a-z0-9-]+)',/gm)) mappa[m[1]] = m[2]

const presenti = new Set(
  fs.readdirSync('public/loghi').filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', ''))
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await db.from('giocatori').select('squadra')
if (error) { console.log('errore:', error.message); process.exit(1) }

const conta = {}
for (const g of data ?? []) conta[g.squadra] = (conta[g.squadra] ?? 0) + 1
const squadre = Object.entries(conta).sort((a, b) => a[0].localeCompare(b[0], 'it'))

const senza = []
for (const [nome, quanti] of squadre) {
  const file = mappa[chiave(nome)]
  if (!file || !presenti.has(file)) senza.push({ nome, quanti, k: chiave(nome), file })
}

console.log(`${data.length} giocatori · ${squadre.length} squadre nel listone`)

if (senza.length === 0) {
  console.log(`\nok  tutte le ${squadre.length} squadre hanno lo stemma.`)
} else {
  console.log(`\nNO  ${senza.length} squadre senza stemma:`)
  for (const s of senza) {
    const motivo = !s.file
      ? `nessuna voce per la chiave "${s.k}"`
      : `la voce punta a "${s.file}.png", che non esiste`
    console.log(`    ${s.nome.padEnd(24)} (${String(s.quanti).padStart(2)} giocatori) — ${motivo}`)
  }
}

// Voci che puntano nel vuoto: succede rinominando un file senza toccare la mappa.
const rotte = Object.entries(mappa).filter(([, f]) => !presenti.has(f))
if (rotte.length) {
  console.log(`\nNO  ${rotte.length} voci di mappa puntano a un file inesistente:`)
  for (const [k, f] of rotte) console.log(`    ${k} -> ${f}.png`)
}

// File mai usati: i loghi dei campionati stanno qui di proposito.
const inutilizzati = [...presenti].filter((f) => !Object.values(mappa).includes(f))
if (inutilizzati.length) console.log(`\n--  file presenti e mai usati: ${inutilizzati.join(', ')}`)

process.exit(senza.length + rotte.length > 0 ? 1 : 0)
