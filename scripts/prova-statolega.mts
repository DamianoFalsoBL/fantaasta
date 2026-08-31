/**
 * Prova della funzione pura `descriviStato`, temporanea.
 * Si lancia con: node --experimental-strip-types scripts/prova-statolega.mts
 */
import { descriviStato, type FotoLega } from '../src/utils/statoLega.ts'

const INTER = '11111111-1111-1111-1111-111111111111'
const AMS = '22222222-2222-2222-2222-222222222222'
const JUVE = '33333333-3333-3333-3333-333333333333'

const NOMI = { [INTER]: 'FC Internazionale', [AMS]: 'Amsterdamsche FCA', [JUVE]: 'Juventus' }
const T0 = new Date('2026-08-31T20:00:00Z').getTime()

const base: FotoLega = {
  ordineChiamata: [INTER, AMS, JUVE],
  indiceChiamata: 1,
  faseBusteAperta: false,
  asta: null,
  annuncio: null,
  miaSquadraId: AMS,
  nomiSquadre: NOMI,
  slotLiberi: 4,
  bustaConsegnata: false,
  squadreAttive: new Set([INTER, AMS, JUVE]),
  adesso: T0,
}

const casi: [string, Partial<FotoLega>, string][] = [
  // --- annunci
  ['annuncio aggiudicato',
    { annuncio: { tipo: 'aggiudicato', giocatore: 'Bijlow', squadra: 'FC Internazionale', prezzo: 12 } },
    'FC Internazionale si aggiudica Bijlow per 12 crediti'],
  ['annuncio a 1 credito (singolare)',
    { annuncio: { tipo: 'aggiudicato', giocatore: 'Bijlow', squadra: 'Juventus', prezzo: 1 } },
    'Juventus si aggiudica Bijlow per 1 credito'],
  ['annuncio senza squadra nota',
    { annuncio: { tipo: 'aggiudicato', giocatore: 'Bijlow', squadra: null, prezzo: 5 } },
    'Bijlow aggiudicato per 5 crediti'],
  ['annuncio chiusa senza assegnare',
    { annuncio: { tipo: 'non-assegnato', giocatore: 'Bijlow' } },
    'Bijlow: asta chiusa senza assegnazione'],
  ['annuncio sorteggio', { annuncio: { tipo: 'sorteggio' } }, 'Ordine di chiamata sorteggiato'],
  ['annuncio scavalca anche le buste',
    { faseBusteAperta: true, annuncio: { tipo: 'sorteggio' } },
    'Ordine di chiamata sorteggiato'],

  // --- buste
  ['buste da consegnare', { faseBusteAperta: true }, 'Buste aperte · devi consegnare 4 giocatori'],
  ['buste, un solo slot', { faseBusteAperta: true, slotLiberi: 1 }, 'Buste aperte · devi consegnare 1 giocatore'],
  ['buste consegnate', { faseBusteAperta: true, bustaConsegnata: true }, 'Buste aperte · hai consegnato · si attendono gli altri'],
  ['buste, rosa piena', { faseBusteAperta: true, slotLiberi: 0 }, 'Buste aperte · la tua rosa è completa'],
  ['buste, super admin', { faseBusteAperta: true, miaSquadraId: null, slotLiberi: null }, 'Fase buste aperta'],

  // --- asta
  ['prenotata da altri',
    { asta: { stato: 'CHIAMATA', giocatore: 'Bijlow', prezzo: 8, squadraInTesta: INTER, scadenza: null } },
    "FC Internazionale ha prenotato Bijlow · si attende l'avvio dell'admin"],
  ['prenotata da me',
    { asta: { stato: 'CHIAMATA', giocatore: 'Bijlow', prezzo: 8, squadraInTesta: AMS, scadenza: null } },
    "Hai prenotato Bijlow · si attende l'avvio dell'admin"],
  ['in corso',
    { asta: { stato: 'IN_CORSO', giocatore: 'Bijlow', prezzo: 12, squadraInTesta: INTER, scadenza: new Date(T0 + 20000).toISOString() } },
    'Bijlow in asta · 12 cr · FC Internazionale'],
  ['scaduta, da assegnare',
    { asta: { stato: 'IN_CORSO', giocatore: 'Bijlow', prezzo: 12, squadraInTesta: INTER, scadenza: new Date(T0 - 1000).toISOString() } },
    "Asta finita: Bijlow a FC Internazionale per 12 cr · l'admin deve assegnare"],

  // --- turni
  ['ordine da sorteggiare', { ordineChiamata: [], squadreAttive: null }, 'Ordine di chiamata da sorteggiare'],
  ['tocca a me', { indiceChiamata: 2 }, 'Tocca a te: scegli chi chiamare'],
  ['tocca ad altri, con il poi', {}, 'Tocca a FC Internazionale · poi Amsterdamsche FCA'],
  ['il poi salta chi ha finito',
    { squadreAttive: new Set([INTER, JUVE]) },
    'Tocca a FC Internazionale · poi Juventus'],
  ['senza squadreAttive niente poi', { squadreAttive: null }, 'Tocca a FC Internazionale'],
  ['il poi torna in cima', { indiceChiamata: 3, squadreAttive: new Set([INTER, JUVE]) }, 'Tocca a Juventus · poi FC Internazionale'],
  ['nessuno ha più da chiamare', { squadreAttive: new Set() }, 'Aste a chiamata concluse'],

  // --- casi limite: nessuno deve produrre "undefined"
  ['indice fuori scala', { indiceChiamata: 9 }, 'Aste a chiamata in corso'],
  ['indice zero', { indiceChiamata: 0 }, 'Aste a chiamata in corso'],
  ['squadra di turno senza nome in mappa',
    { nomiSquadre: { [AMS]: 'Amsterdamsche FCA' }, squadreAttive: null },
    "Tocca a un'altra squadra"],
  ['squadra in testa senza nome in mappa',
    { nomiSquadre: {}, asta: { stato: 'IN_CORSO', giocatore: 'Bijlow', prezzo: 12, squadraInTesta: INTER, scadenza: new Date(T0 + 20000).toISOString() } },
    'Bijlow in asta · 12 cr'],
  ['ordine con una sola squadra: niente poi', { ordineChiamata: [INTER] }, 'Tocca a FC Internazionale'],
]

let falliti = 0
for (const [titolo, modifica, atteso] of casi) {
  const riga = descriviStato({ ...base, ...modifica })
  const ok = riga.testo === atteso
  if (!ok) falliti++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${titolo}`)
  if (!ok) console.log(`       atteso:  ${atteso}\n       ottenuto: ${riga.testo}`)
}

// Nessun ramo deve mai far comparire "undefined" o "null" nel testo mostrato.
const sospetti = casi
  .map(([t, m]) => [t, descriviStato({ ...base, ...m })] as const)
  .filter(([, r]) => /undefined|null|NaN/.test(r.testo) || r.dettaglio.some((d) => /undefined|null/.test(d)))
if (sospetti.length > 0) {
  falliti += sospetti.length
  console.log('\nTESTI CON UN BUCO:')
  for (const [t, r] of sospetti) console.log(`  ${t}: ${r.testo} | ${r.dettaglio.join(', ')}`)
}

// Il countdown va appeso solo con l'asta viva.
const viva = descriviStato({ ...base, asta: { stato: 'IN_CORSO', giocatore: 'B', prezzo: 1, squadraInTesta: INTER, scadenza: new Date(T0 + 5000).toISOString() } })
const ferma = descriviStato({ ...base, asta: { stato: 'CHIAMATA', giocatore: 'B', prezzo: 1, squadraInTesta: INTER, scadenza: null } })
const scaduta = descriviStato({ ...base, asta: { stato: 'IN_CORSO', giocatore: 'B', prezzo: 1, squadraInTesta: INTER, scadenza: new Date(T0 - 1).toISOString() } })
console.log(`\nscadenza esposta: viva=${viva.scadenza !== null} prenotata=${ferma.scadenza !== null} scaduta=${scaduta.scadenza !== null}  (atteso true/false/false)`)
if (viva.scadenza === null || ferma.scadenza !== null || scaduta.scadenza !== null) falliti++

console.log(`\n${casi.length} casi, ${falliti} falliti`)
process.exit(falliti > 0 ? 1 : 0)
