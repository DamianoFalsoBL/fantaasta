/**
 * L'abbinamento nome squadra -> file dello stemma.
 * node scripts/prova-abbinamento-loghi.mjs
 *
 * Serve perche' un abbinamento mancato non somiglia a un guasto: lo stemma
 * semplicemente non compare, e nessuno se ne accorge finche' non lo cerca.
 */
import fs from 'node:fs'

const src = fs.readFileSync('src/components/LogoSquadra.tsx', 'utf8')
const blocco = src.slice(src.indexOf('FILE_PER_SQUADRA'), src.indexOf('/**\n * Il nome della squadra'))
const mappa = {}
for (const m of blocco.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'([a-z0-9-]+)',/gm)) mappa[m[1]] = m[2]

const chiave = (s) => s.trim().toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')

const nomi = [
  'Inter', 'Milan', 'Juventus', 'Como',
  'Real Madrid', 'Bayern München', 'Paris Saint-Germain', 'Manchester City',
  'Manchester United', 'Aston Villa', 'Atletico Madrid', 'Borussia Dortmund',
  'RB Leipzig', 'VfB Stuttgart', 'Athletic Club', 'Real Betis',
  'Bayer Leverkusen', 'Eintracht Frankfurt', 'RC Strasbourg',
  'Tottenham', 'Marseille', 'Monaco', 'Rennes', 'Villarreal', 'Barcelona',
  'Arsenal', 'Chelsea', 'Liverpool', 'Newcastle', 'Bournemouth', 'Brighton',
]
let senza = 0
console.log('nome nel listone            -> chiave              -> file')
for (const n of nomi) {
  const k = chiave(n)
  const f = mappa[k]
  if (!f) senza++
  console.log(`${n.padEnd(26)} -> ${k.padEnd(20)} -> ${f ?? 'NESSUNO'}`)
}
const mancanti = Object.values(mappa).filter((f) => !fs.existsSync(`public/loghi/${f}.png`))
console.log(`\n${nomi.length} nomi provati | senza stemma: ${senza}`)
console.log(`voci di mappa che puntano a un file inesistente: ${mancanti.length ? mancanti.join(', ') : 'nessuna'}`)
console.log(`file presenti ma non in mappa: ${fs.readdirSync('public/loghi').filter(f=>f.endsWith('.png')).map(f=>f.replace('.png','')).filter(f=>!Object.values(mappa).includes(f)).join(', ')}`)
process.exit(senza + mancanti.length > 0 ? 1 : 0)
