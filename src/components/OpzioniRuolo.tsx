'use client'

import { RUOLI_CLASSICI, opzioniMantra } from '@/utils/ruoli'

/**
 * Le voci della tendina "Ruolo", uguali in ogni pagina che la usa.
 *
 * Sta in un componente e non copiata due volte perché i filtri di /svincolati
 * e /aste erano già divergenti prima: stesso scopo, elenchi costruiti in modo
 * leggermente diverso.
 *
 * **Rimane solo per /trasferimenti.** Le altre pagine sono passate a
 * `SceltaRuoli`, che permette di scegliere piu' ruoli insieme; il mercato e'
 * chiuso, quindi quella pagina non si puo' guardare funzionare e convertirla
 * alla cieca sarebbe l'unico modo di romperla senza accorgersene. Quando il
 * mercato riapre, questo file dovrebbe sparire.
 */
export default function OpzioniRuolo({ presenti }: { presenti: Set<string> }) {
  return (
    <>
      <option value="">Tutti i ruoli</option>
      {/* Le intestazioni sono scritte in maiuscolo e fra lineette perché il
          menu a tendina nativo è disegnato dal sistema operativo: su macOS il
          CSS applicato a <optgroup> viene ignorato, e il solo grassetto non
          bastava a distinguerle dalle voci. Il testo invece si vede ovunque.
          Le regole in globals.css rifiniscono il risultato dove il browser
          disegna la tendina da sé (Chrome su Windows e Linux). */}
      <optgroup label="— REPARTO —">
        {RUOLI_CLASSICI.map((o) => (
          <option key={o.valore} value={o.valore}>{o.etichetta}</option>
        ))}
      </optgroup>
      <optgroup label="— RUOLO MANTRA —">
        {opzioniMantra(presenti).map((o) => (
          <option key={o.valore} value={o.valore}>{o.etichetta}</option>
        ))}
      </optgroup>
    </>
  )
}
