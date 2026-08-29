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

export default function LogoSquadra({ squadra }: { squadra: string | null | undefined }) {
  if (!squadra) return null
  const file = FILE_PER_SQUADRA[squadra.trim().toLowerCase()]
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
