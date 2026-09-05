import { chiaveClub } from '@/utils/campionati'

/**
 * Lo stemma della squadra di Serie A accanto al nome del club.
 *
 * I file stanno in `public/loghi/`, PNG 64x64 da una cinquantina di KB in
 * tutto. Non si punta al CDN da cui vengono: sarebbe banda a spese altrui, e
 * il giorno che cambiano gli indirizzi la pagina si riempie di immagini rotte.
 *
 * `next/image` è evitato di proposito: su Vercel le trasformazioni si pagano a
 * quota, e su un PNG statico da 2 KB non c'è niente da ottimizzare.
 */

/**
 * Le venti squadre per cui il file esiste davvero.
 *
 * È un elenco esplicito e non un `onError` sull'immagine: così una squadra
 * senza stemma non disegna nulla, invece di far comparire per un attimo
 * l'icona di immagine rotta e poi sparire. Se il listone cambia — una
 * promossa, una retrocessa — vanno aggiunti **tutti e due**: il file in
 * `public/loghi/` e la voce qui.
 */
const FILE_PER_SQUADRA: Record<string, string> = {
  atalanta: 'atalanta',
  bologna: 'bologna',
  cagliari: 'cagliari',
  // Sul sito di origine il file si chiama `como-1907`: tenuto com'era invece
  // di rinominarlo, così chi riscarica gli stemmi ritrova lo stesso nome.
  como: 'como-1907',
  fiorentina: 'fiorentina',
  frosinone: 'frosinone',
  genoa: 'genoa',
  inter: 'inter',
  juventus: 'juventus',
  lazio: 'lazio',
  lecce: 'lecce',
  milan: 'milan',
  monza: 'monza',
  napoli: 'napoli',
  parma: 'parma',
  roma: 'roma',
  sassuolo: 'sassuolo',
  torino: 'torino',
  udinese: 'udinese',
  venezia: 'venezia',

  // --- Premier League, Liga, Ligue 1, Bundesliga ---
  // Caricate il 2 settembre. **Nel listone di oggi non c'e' nessun giocatore
  // di queste squadre**: restano inerti finche' non si importa un listone che
  // le contiene, e una squadra senza voce qui non disegna nulla.
  //
  // **La chiave e' il nome che sta nel listone, non quello ufficiale.** Il
  // listone italiano traduce: «Bayern Monaco», «Lipsia», «Stoccarda»,
  // «Barcellona», «Olympique Marsiglia». Verificato sul listone importato il
  // 2 settembre, dove nove squadre su trentasette non trovavano lo stemma
  // proprio per questo.
  //
  // Dove il nome italiano e quello del file divergono ci sono **due voci verso
  // lo stesso file**: la seconda copre il caso di un listone scritto in
  // inglese, e costa una riga. Stesso motivo per cui esiste `como: 'como-1907'`.
  // Premier League
  arsenal: 'arsenal',
  'aston-villa': 'aston-villa',
  bournemouth: 'bournemouth',
  brighton: 'brighton',
  chelsea: 'chelsea',
  liverpool: 'liverpool',
  'manchester-city': 'manchester-city',
  'manchester-united': 'manchester-united',
  newcastle: 'newcastle',
  tottenham: 'tottenham',

  // Liga. Il listone italiano traduce, e la chiave e' il nome che sta nel
  // listone: la colonna «squadra» dei giocatori, non il nome ufficiale.
  'athletic-bilbao': 'athletic-club',
  'athletic-club': 'athletic-club',
  'atletico-madrid': 'atletico-madrid',
  barcellona: 'barcelona',
  barcelona: 'barcelona',
  betis: 'betis',
  'real-betis': 'betis',
  'real-madrid': 'real-madrid',
  villarreal: 'villarreal',

  // Ligue 1
  marseille: 'marseille',
  'olympique-marsiglia': 'marseille',
  monaco: 'monaco',
  'paris-saint-germain': 'paris-saint-germain',
  'racing-strasburgo': 'strasbourg',
  strasbourg: 'strasbourg',
  rennes: 'rennes',

  // Bundesliga
  'bayer-leverkusen': 'bayer-leverkusen',
  'bayern-monaco': 'bayern-monaco',
  'bayern-munchen': 'bayern-monaco',
  'borussia-dortmund': 'borussia-dortmund',
  eintracht: 'eintracht',
  'eintracht-frankfurt': 'eintracht',
  lipsia: 'leipzig',
  leipzig: 'leipzig',
  'rb-leipzig': 'leipzig',
  stoccarda: 'stuttgart',
  stuttgart: 'stuttgart',
  'vfb-stuttgart': 'stuttgart',
}

/**
 * La riduzione del nome del club sta in `utils/campionati.ts`, dove serve alle
 * stesse identiche chiavi. Due copie che divergono vorrebbero dire uno stemma
 * trovato e un campionato no, sullo stesso club, senza che si capisca perche'.
 */

/**
 * Gli stemmi disegnati **interamente in nero**, che sul fondo scuro del sito
 * spariscono. Su questi si applica `invert`, che su un disegno monocromatico
 * nero produce esattamente la versione bianca ufficiale.
 *
 * Misurate tutte e venti le immagini su tela: la Juventus è l'unica con
 * luminanza media 0 e **zero** pixel chiari. Il secondo stemma più scuro è il
 * Sassuolo, a 64, ma ha il 42% di pixel chiari e si legge benissimo.
 *
 * **Non aggiungere qui uno stemma a colori.** `invert` su un disegno colorato
 * non lo schiarisce: ne ribalta le tinte, e il risultato è irriconoscibile.
 * Vale solo per il nero pieno.
 */
const STEMMI_TUTTI_NERI = new Set(['juventus'])

/**
 * Stemmi scuri ma **colorati**, che su fondo scuro si leggono male e che
 * `invert` rovinerebbe invece di salvare.
 *
 * Il Tottenham e' blu notte: luminanza 34 su un fondo a 13, cioe' circa 2,2:1.
 * Invertirlo darebbe un giallino irriconoscibile — `invert` funziona solo sul
 * nero pieno. Qui si aggiunge un alone chiaro attorno alla sagoma, che stacca
 * il disegno dal fondo **senza toccarne i colori**.
 *
 * La soglia e' la luminanza sotto 50 misurata da
 * `scripts/prova-luminanza-loghi.mjs`. Il Liverpool, secondo piu' scuro fra
 * quelli in uso, sta a 71 (circa 4,2:1) e non ne ha bisogno.
 */
const STEMMI_SCURI = new Set(['tottenham'])

// Rimisurati tutti e 51 i file il 2 settembre con
// `scripts/prova-luminanza-loghi.mjs`, che legge i PNG senza browser.
// La Juventus resta l'unica squadra a luminanza 0 e zero pixel chiari.
//
// **Un caso da tenere d'occhio: il Tottenham** — luminanza 34 e nessun pixel
// chiaro, quindi sul fondo scuro si legge male. Non va pero' in questo elenco:
// non e' nero pieno ma blu notte, e `invert` lo ribalterebbe in un giallino
// irriconoscibile. Se un giorno servira' davvero, la strada e' un alone chiaro
// dietro l'immagine, non l'inversione.
//
// (`ligue-1.png` e' a luminanza 0 come la Juventus, ma e' il logo di un
// campionato e non compare nella mappa: come `serie-a.png`, non si usa.)

export default function LogoSquadra({ squadra }: { squadra: string | null | undefined }) {
  if (!squadra) return null
  const file = FILE_PER_SQUADRA[chiaveClub(squadra)]
  if (!file) return null

  return (
    <img
      src={`/loghi/${file}.png`}
      // Decorativo: il nome della squadra è scritto qui accanto, e un `alt`
      // pieno lo farebbe leggere due volte a chi usa un lettore di schermo.
      alt=""
      aria-hidden="true"
      width={18}
      height={18}
      // `loading="lazy"` conta: in /svincolati le righe sono più di 500, e
      // senza non ci sarebbero venti immagini da decodificare ma cinquecento
      // elementi da preparare subito.
      loading="lazy"
      decoding="async"
      className={`inline-block h-[18px] w-[18px] shrink-0 object-contain align-text-bottom ${
        STEMMI_TUTTI_NERI.has(file) ? 'invert' : ''
      } ${STEMMI_SCURI.has(file) ? 'fm-logo-alone' : ''}`}
    />
  )
}
