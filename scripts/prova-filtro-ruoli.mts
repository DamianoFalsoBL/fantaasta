/**
 * Prova del filtro per piu' ruoli.
 * node --experimental-strip-types scripts/prova-filtro-ruoli.mts
 *
 * La regola che conta e' **«almeno uno»**, non «tutti»: un giocatore ha piu'
 * ruoli Mantra, quindi l'incrocio sarebbe quasi sempre vuoto e il filtro
 * sembrerebbe rotto. Qui si prova che sia davvero un'unione, che il caso
 * singolo continui a funzionare come prima, e che i valori vuoti non filtrino
 * via tutto.
 */
import { ruoloCorrisponde } from '../src/utils/ruoli.ts'

// `filtri.ts` non si importa qui: usa l'alias `@/utils/...`, che fuori da Next
// non si risolve. `passaFiltri` e' comunque solo `testoCorrisponde() &&
// ruoloCorrisponde()` — la logica nuova sta tutta in `ruoloCorrisponde`, che e'
// quella provata qui sotto, e che i tipi combacino lo dice il build.
type GiocatoreFiltrabile = {
  nome: string
  ruolo?: string | null
  squadra?: string | null
  ruolo_mantra?: string[] | null
}

const dc: GiocatoreFiltrabile = { nome: 'Bastoni', ruolo: 'D', squadra: 'Inter', ruolo_mantra: ['Dc'] }
const ds: GiocatoreFiltrabile = { nome: 'Dimarco', ruolo: 'D', squadra: 'Inter', ruolo_mantra: ['Ds', 'E'] }
const att: GiocatoreFiltrabile = { nome: 'Lautaro', ruolo: 'A', squadra: 'Inter', ruolo_mantra: ['Pc'] }
const por: GiocatoreFiltrabile = { nome: 'Sommer', ruolo: 'P', squadra: 'Inter', ruolo_mantra: ['Por'] }
const senzaMantra: GiocatoreFiltrabile = { nome: 'Ignoto', ruolo: 'C', squadra: 'Lecce', ruolo_mantra: null }

let falliti = 0
const prova = (nome: string, ottenuto: boolean, atteso: boolean) => {
  const ok = ottenuto === atteso
  if (!ok) falliti++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${ok ? '' : ` (atteso ${atteso}, ottenuto ${ottenuto})`}`)
}

const r = (filtro: string | string[], g: GiocatoreFiltrabile) =>
  ruoloCorrisponde(filtro, g.ruolo, g.ruolo_mantra)

console.log('--- il caso che ha motivato la modifica: Dc oppure Ds ---')
prova('Dc+Ds prende chi e\' Dc', r(['mn:DC', 'mn:DS'], dc), true)
prova('Dc+Ds prende chi e\' Ds', r(['mn:DC', 'mn:DS'], ds), true)
prova('Dc+Ds NON prende un attaccante', r(['mn:DC', 'mn:DS'], att), false)
prova('Dc+Ds NON prende un portiere', r(['mn:DC', 'mn:DS'], por), false)

console.log('\n--- e\' un\'unione, non un incrocio ---')
prova('chi ha Ds+E passa chiedendo Ds e Pc insieme', r(['mn:DS', 'mn:PC'], ds), true)
prova('chi ha solo Dc NON passa chiedendo Ds e Pc', r(['mn:DS', 'mn:PC'], dc), false)

console.log('\n--- il caso singolo si comporta come prima ---')
prova('stringa sola, Mantra', r('mn:DC', dc), true)
prova('stringa sola, Mantra che non c\'e\'', r('mn:DC', att), false)
prova('stringa sola, reparto classico', r('cl:D', dc), true)
prova('stringa sola, reparto sbagliato', r('cl:A', dc), false)
prova('senza prefisso (link vecchi): reparto', r('D', dc), true)
prova('senza prefisso (link vecchi): mantra', r('Dc', dc), true)
prova('elenco di uno solo', r(['mn:DC'], dc), true)

console.log('\n--- niente scelto: non deve filtrare via nessuno ---')
prova('stringa vuota', r('', att), true)
prova('elenco vuoto', r([], att), true)
prova('elenco di sole stringhe vuote', r(['', ''], att), true)

console.log('\n--- reparti classici e Mantra mescolati ---')
prova('D classico + Pc mantra prende il difensore', r(['cl:D', 'mn:PC'], dc), true)
prova('D classico + Pc mantra prende l\'attaccante', r(['cl:D', 'mn:PC'], att), true)
prova('D classico + Pc mantra NON prende il portiere', r(['cl:D', 'mn:PC'], por), false)

console.log('\n--- chi non ha ruoli Mantra ---')
prova('senza mantra passa col reparto classico', r(['cl:C'], senzaMantra), true)
prova('senza mantra non passa con un mantra', r(['mn:DC'], senzaMantra), false)

console.log(`\n${falliti === 0 ? 'Tutto a posto.' : falliti + ' falliti.'}`)
process.exit(falliti > 0 ? 1 : 0)
