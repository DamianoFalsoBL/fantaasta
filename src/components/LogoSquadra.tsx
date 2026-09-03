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
  // Le chiavi sono i nomi dei file, che gia' seguono la forma normalizzata
  // (minuscolo, trattini). `chiave()` qui sotto trasforma "Real Madrid" in
  // "real-madrid" e "Bayern München" in "bayern-munchen", quindi i nomi piu'
  // comuni combaciano da soli. **Quelli che il listone scrivera' diversamente
  // — "Man City", "PSG", "Inter Milan" — vanno aggiunti come voci in piu' che
  // puntano allo stesso file**, come `como: 'como-1907'` qui sopra.
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

  'athletic-club': 'athletic-club',
  'atletico-madrid': 'atletico-madrid',
  barcelona: 'barcelona',
  'real-betis': 'real-betis',
  'real-madrid': 'real-madrid',
  villarreal: 'villarreal',

  marseille: 'marseille',
  monaco: 'monaco',
  'paris-saint-germain': 'paris-saint-germain',
  'rc-strasbourg': 'rc-strasbourg',
  rennes: 'rennes',

  'bayer-leverkusen': 'bayer-leverkusen',
  'bayern-munchen': 'bayern-munchen',
  'borussia-dortmund': 'borussia-dortmund',
  'eintracht-frankfurt': 'eintracht-frankfurt',
  'rb-leipzig': 'rb-leipzig',
  'vfb-stuttgart': 'vfb-stuttgart',
}

/**
 * Il nome della squadra ridotto alla forma dei file.
 *
 * Prima era `squadra.trim().toLowerCase()`, che bastava per i venti nomi del
 * listone italiano — parole singole senza accenti. Con i club esteri non basta
 * piu': "Real Madrid" ha uno spazio, "Bayern München" ha una dieresi, e senza
 * questa riduzione nessuno dei due troverebbe il proprio file.
 */
function chiave(squadra: string): string {
  return squadra
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // via gli accenti: münchen -> munchen
    .replace(/[\s_]+/g, '-')            // spazi e trattini bassi -> trattino
    .replace(/[^a-z0-9-]/g, '')         // via punteggiatura: "St. Pauli" -> st-pauli
}

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
  const file = FILE_PER_SQUADRA[chiave(squadra)]
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
      }`}
    />
  )
}
