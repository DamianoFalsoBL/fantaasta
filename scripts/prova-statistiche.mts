/**
 * I conti della pagina Statistiche, provati sui dati veri.
 *
 * Si lancia con: node --experimental-strip-types scripts/prova-statistiche.mts
 *
 * Una media sbagliata non si vede: resta un numero plausibile. Questa prova
 * fa due cose che leggere il codice non fa.
 *
 * 1. **Quadratura.** La spesa d'asta ricostruita dai tesseramenti deve fare
 *    esattamente `budget_iniziale - crediti_residui`, che il database tiene
 *    aggiornato per conto suo. Sono due strade indipendenti verso lo stesso
 *    numero: se combaciano su tutte le squadre, l'insieme "preso in questa
 *    asta" e' quello giusto.
 *
 * 2. **Controprova.** Mostra anche la media sbagliata — quella su tutta la
 *    rosa, che mescola i prezzi d'asta con i costi del file di import — per
 *    verificare che la distinzione conti davvero. Se le due medie fossero
 *    uguali, il lavoro fatto per separarle sarebbe inutile e questa prova non
 *    starebbe dimostrando niente.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import {
  riassumiLega,
  riassumiRuoli,
  riassumiSquadre,
  type GiocatoreInRosa,
} from '../src/utils/statistiche.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n').filter((r) => r.includes('=') && !r.trim().startsWith('#'))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

// Le stesse identiche interrogazioni della pagina.
const [squadreRes, tessRes, asteRes, busteRes] = await Promise.all([
  db.from('squadre').select('id, nome, budget_iniziale, crediti_residui').order('nome'),
  db.from('tesseramenti').select('squadra_id, prezzo_pagato, giocatori(id, nome, eta, ruolo, quotazione)', { count: 'exact' }),
  db.from('aste').select('giocatore_id').eq('stato', 'CHIUSA').not('squadra_in_testa', 'is', null),
  db.from('buste').select('giocatore_id').eq('esito', 'VINTO'),
])

for (const [nome, res] of [['squadre', squadreRes], ['tesseramenti', tessRes], ['aste', asteRes], ['buste', busteRes]] as const) {
  if (res.error) { console.log(`errore su ${nome}:`, res.error.message); process.exit(1) }
}

const squadre = (squadreRes.data ?? []).map((s) => ({
  id: s.id as string, nome: s.nome as string,
  budgetIniziale: s.budget_iniziale as number, creditiResidui: s.crediti_residui as number,
}))

const presiInAsta = new Set<number>([
  ...(asteRes.data ?? []).map((a) => a.giocatore_id as number),
  ...(busteRes.data ?? []).map((b) => b.giocatore_id as number),
])

type Riga = { squadra_id: string; prezzo_pagato: number; giocatori: { id: number; nome: string; eta: number | null; ruolo: string; quotazione: number } | null }
const tess = (tessRes.data ?? []) as unknown as Riga[]
console.log(`tesseramenti letti ${tess.length}, dichiarati dal database ${tessRes.count}`)
if (tessRes.count !== tess.length) { console.log('LA RISPOSTA E\' TRONCATA: le medie sarebbero parziali.'); process.exit(1) }

const rosa: GiocatoreInRosa[] = tess.filter((t) => t.giocatori).map((t) => ({
  id: t.giocatori!.id, nome: t.giocatori!.nome, eta: t.giocatori!.eta,
  ruolo: t.giocatori!.ruolo, quotazione: t.giocatori!.quotazione,
  prezzoPagato: t.prezzo_pagato, squadraId: t.squadra_id,
  presoInAsta: presiInAsta.has(t.giocatori!.id),
}))

const righe = riassumiSquadre(squadre, rosa)
const totali = riassumiLega(rosa)

console.log(`\naste chiuse con vincitore ${asteRes.data?.length}, buste vinte ${busteRes.data?.length}, insieme distinto ${presiInAsta.size}`)
console.log(`in rosa ${totali.giocatori}: ${totali.presiInAsta} presi in asta, ${totali.importati} arrivati con l'import\n`)

console.log('Squadra'.padEnd(26), 'eta\'  quot   presi  spesi  media  listino  residui  quadra')
for (const r of [...righe].sort((a, b) => (a.etaMedia ?? 0) - (b.etaMedia ?? 0))) {
  console.log(
    r.nome.padEnd(26),
    (r.etaMedia?.toFixed(2) ?? '—').padStart(5),
    (r.quotMedia?.toFixed(2) ?? '—').padStart(6),
    String(r.presiInAsta).padStart(5),
    String(r.spesoInAsta).padStart(6),
    (r.mediaAsta?.toFixed(2) ?? '—').padStart(7),
    (r.rapportoListino?.toFixed(2) ?? '—').padStart(8),
    String(r.creditiResidui).padStart(8),
    r.quadra ? '   si' : '   NO',
  )
}

// --- 1. Quadratura ---------------------------------------------------------
const nonQuadrano = righe.filter((r) => !r.quadra)
console.log()
if (nonQuadrano.length === 0) {
  console.log(`QUADRATURA: tutte e ${righe.length} le squadre tornano al credito.`)
} else {
  console.log(`QUADRATURA FALLITA su ${nonQuadrano.length} squadre:`)
  for (const r of nonQuadrano) {
    const s = squadre.find((x) => x.id === r.id)!
    console.log(`  ${r.nome}: ricostruito ${r.spesoInAsta}, atteso ${s.budgetIniziale - s.creditiResidui}`)
  }
}

// --- 2. Controprova: la media sbagliata e' davvero diversa? ----------------
const mediaTuttaRosa = rosa.reduce((t, g) => t + g.prezzoPagato, 0) / rosa.length
console.log()
console.log(`CONTROPROVA — media su tutta la rosa (sbagliata): ${mediaTuttaRosa.toFixed(2)} crediti`)
console.log(`             media sui soli acquisti d'asta (giusta): ${totali.mediaAsta?.toFixed(2)} crediti`)
const scarto = Math.abs((totali.mediaAsta ?? 0) - mediaTuttaRosa)
console.log(scarto < 0.5
  ? '  Le due medie coincidono: su questi dati la prova non dimostra niente.'
  : `  Scarto di ${scarto.toFixed(2)} crediti: la distinzione cambia il risultato, quindi conta.`)

// Quanto assomigliano i prezzi importati alle quotazioni: e' la ragione per
// cui mescolarli falsava tutto.
const importati = rosa.filter((g) => !g.presoInAsta)
const pariQuotazione = importati.filter((g) => g.prezzoPagato === g.quotazione).length
const sopra = importati.filter((g) => g.prezzoPagato > g.quotazione).length
console.log(`  dei ${importati.length} importati, ${pariQuotazione} hanno prezzo identico alla quotazione e solo ${sopra} lo superano`)

// --- Reparti ---------------------------------------------------------------
console.log('\nReparti:')
for (const r of riassumiRuoli(rosa)) {
  console.log(`  ${r.ruolo}: ${r.inRosa} in rosa, quotazione media ${r.quotMedia.toFixed(2)}, ` +
    `${r.presiInAsta} presi in asta a ${r.prezzoMedioAsta?.toFixed(2) ?? '—'} (${r.rapportoListino?.toFixed(2) ?? '—'}x il listino)`)
}
