/**
 * I casi limite del «quanto manca al mio turno».
 *
 * Si lancia con: node --experimental-strip-types scripts/prova-ordinechiamata.mts
 *
 * Il conto non ha nessun segnale visibile quando sbaglia: «mancano 3 turni»
 * resta una frase sensata anche se i turni sono 5, e ci si accorge dell'errore
 * solo perdendosi il proprio turno in asta. I casi che contano sono due, e
 * nessuno dei due e' quello normale: l'ultimo della fila (il «poi tocca a…»
 * deve tornare al primo) e chi ha gia' chiamato (posto prima del turno).
 *
 * Parte dall'ordine vero in `regole_lega`, cosi' la prova gira sui numeri
 * della lega e non su un ordine inventato.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { avvisoTurno, descriviTurno } from '../src/utils/ordineChiamata.ts'

let passate = 0
let fallite = 0
function verifica(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto)
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}${ok ? '' : `\n        atteso ${JSON.stringify(atteso)}, ottenuto ${JSON.stringify(ottenuto)}`}`)
  ok ? passate++ : fallite++
}

// --- Casi costruiti: quattro squadre, tutte ancora in gara -----------------
const quattro = ['a', 'b', 'c', 'd']
const tutte = new Set(quattro)

console.log('Quattro squadre, nessuna ha finito:')
{
  const s = descriviTurno(quattro, 1, tutte, 'c')
  verifica('turno = a', 'a', s.turno)
  verifica('dopo = b', 'b', s.dopo)
  verifica('a c mancano 2 turni', 2, s.turniMancanti)
  verifica('frase', 'mancano 2 turni', avvisoTurno(s.turniMancanti, false))
}
{
  // L'ULTIMO DELLA FILA: senza il modulo, `dopo` sarebbe undefined e la riga
  // compatta perderebbe il «poi tocca a…» proprio all'ultimo turno del giro.
  const s = descriviTurno(quattro, 4, tutte, 'a')
  verifica('turno = d', 'd', s.turno)
  verifica('dopo torna ad a', 'a', s.dopo)
  verifica('a ha gia\' chiamato: negativo', -3, s.turniMancanti)
  verifica('frase', 'hai già chiamato in questo giro', avvisoTurno(s.turniMancanti, false))
}
{
  const s = descriviTurno(quattro, 2, tutte, 'b')
  verifica('e\' il mio turno: zero', 0, s.turniMancanti)
  verifica('frase quando e\' il mio turno', 'tocca a te', avvisoTurno(s.turniMancanti, true))
}
{
  // Chi non e' nella fila: l'admin senza squadra, o chi ha la rosa piena.
  const s = descriviTurno(quattro, 2, tutte, null)
  verifica('fuori dalla fila: null', null, s.turniMancanti)
  verifica('nessuna frase', null, avvisoTurno(s.turniMancanti, false))
}

console.log('\nCon due squadre che hanno finito (b e d):')
{
  const attive = new Set(['a', 'c'])
  const s = descriviTurno(quattro, 1, attive, 'c')
  verifica('la fila salta b e d', ['a', 'c'], s.daChiamare)
  verifica('due concluse', 2, s.concluse)
  // Il conto va fatto sulla fila filtrata, non sull'ordine intero: contando su
  // quello, a c risulterebbero 2 turni invece di 1.
  verifica('a c manca 1 turno, non 2', 1, s.turniMancanti)
  verifica('frase', 'sei il prossimo', avvisoTurno(s.turniMancanti, false))
}
{
  // La squadra di turno ha finito: resta nella fila lo stesso, altrimenti la
  // barra perderebbe il riferimento mentre il turno avanza.
  const s = descriviTurno(quattro, 2, new Set(['a', 'c']), 'a')
  verifica('b resta in fila perche\' e\' di turno', ['a', 'b', 'c'], s.daChiamare)
  verifica('turno = b', 'b', s.turno)
}

console.log('\nOrdine vuoto (prima del sorteggio):')
{
  const s = descriviTurno([], 1, new Set(), 'a')
  verifica('fila vuota', [], s.daChiamare)
  verifica('nessun turno', undefined, s.turno)
  verifica('nessun conto', null, s.turniMancanti)
}

// --- Sull'ordine vero della lega ------------------------------------------
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: regole } = await db.from('regole_lega').select('ordine_chiamata, indice_chiamata').limit(1).maybeSingle()
const { data: squadre } = await db.from('squadre').select('id, nome')
const nomi = Object.fromEntries((squadre ?? []).map((s) => [s.id, s.nome]))
const ordine: string[] = regole?.ordine_chiamata ?? []
const indice: number = regole?.indice_chiamata ?? 1

console.log(`\nOrdine vero: ${ordine.length} squadre, indice ${indice}`)
if (ordine.length > 0) {
  const attive = new Set(ordine)
  // Ogni squadra deve vedere un numero diverso, e la somma dei posti deve
  // coprire tutta la fila: se due squadre leggessero lo stesso «mancano N»,
  // una delle due arriverebbe in ritardo.
  const visti = ordine.map((sq) => descriviTurno(ordine, indice, attive, sq).turniMancanti)
  console.log(`  turni mancanti per ciascuna: ${visti.join(', ')}`)
  verifica('tutti valori distinti', ordine.length, new Set(visti).size)
  verifica('la squadra di turno vede zero', 0, descriviTurno(ordine, indice, attive, ordine[indice - 1]).turniMancanti)
  const s = descriviTurno(ordine, indice, attive, null)
  console.log(`  di turno: ${nomi[s.turno ?? '']} · poi: ${nomi[s.dopo ?? '']}`)
}

console.log(`\n${passate} passate, ${fallite} fallite`)
process.exit(fallite === 0 ? 0 : 1)
