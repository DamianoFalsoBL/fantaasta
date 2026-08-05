'use client'

import { RUOLI_CLASSICI, opzioniMantra } from '@/utils/ruoli'

/**
 * Le voci della tendina "Ruolo", uguali in ogni pagina che la usa.
 *
 * Sta in un componente e non copiata due volte perché i filtri di /svincolati
 * e /aste erano già divergenti prima: stesso scopo, elenchi costruiti in modo
 * leggermente diverso.
 */
export default function OpzioniRuolo({ presenti }: { presenti: Set<string> }) {
  return (
    <>
      <option value="">Tutti i ruoli</option>
      <optgroup label="Reparto">
        {RUOLI_CLASSICI.map((o) => (
          <option key={o.valore} value={o.valore}>{o.etichetta}</option>
        ))}
      </optgroup>
      <optgroup label="Ruolo Mantra">
        {opzioniMantra(presenti).map((o) => (
          <option key={o.valore} value={o.valore}>{o.etichetta}</option>
        ))}
      </optgroup>
    </>
  )
}
