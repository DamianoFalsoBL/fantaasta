import type { MetadataRoute } from 'next'

/**
 * Il manifesto che rende il sito installabile sul telefono.
 *
 * All'asta si sta sul telefono per ore: installandolo, il sito si apre a
 * schermo intero dall'icona in home, senza la barra dell'indirizzo che ruba
 * una striscia proprio dove sta la fascia «a che punto siamo».
 *
 * **Niente service worker, ed è una scelta.** Un service worker servirebbe a
 * far funzionare il sito offline, ma qui tutto dipende dal tempo reale: una
 * pagina servita dalla cache durante un'asta mostrerebbe un prezzo vecchio e
 * un timer fermo, e sarebbe indistinguibile da un guasto. Meglio una pagina
 * che non si apre — e si vede — di una che si apre e mente. Qui si punta solo
 * all'installabilità.
 *
 * File `manifest.ts` e non `public/manifest.json`: così Next lo serve su
 * `/manifest.webmanifest` e ne mette da sé il `<link>` in ogni pagina, senza
 * doverlo aggiungere a mano nel layout.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FantaAsta',
    short_name: 'FantaAsta',
    description: "Gestione live dell'asta del fantacalcio",
    // `start_url` sull'asta e non sulla home: chi apre l'icona durante la
    // serata vuole il tabellone, non la pagina di accesso — e chi non ha
    // ancora una sessione viene comunque rimandato al login.
    start_url: '/asta',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'it',
    // Gli stessi due colori del tema scuro dichiarati in `layout.tsx`: lo
    // sfondo che il sistema mostra durante l'apertura e la tinta della barra
    // di stato. Se cambiano lì, vanno cambiati anche qui.
    background_color: '#120b23',
    theme_color: '#120b23',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
