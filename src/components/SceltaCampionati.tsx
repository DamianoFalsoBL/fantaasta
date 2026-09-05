'use client'

import { useEffect, useRef } from 'react'
import { CAMPIONATI } from '@/utils/campionati'

/**
 * Il filtro dei campionati, a scelta multipla.
 *
 * Nasce come tendina a scelta singola e diventa multipla per la stessa ragione
 * dei ruoli: «Premier **e** Bundesliga» è una domanda normale, e con una
 * tendina bisognava guardare due volte la stessa lista.
 *
 * Stessa meccanica di `SceltaRuoli` — `<details>`, che apre e chiude da sé, da
 * tastiera e con lo schermo letto, più il solo clic fuori che il browser non
 * copre. Due componenti e non uno solo generico: le voci qui non si filtrano
 * su cosa è presente in lista (i campionati sono cinque e fissi) e non hanno
 * sezioni, quindi un componente unico avrebbe più parametri che corpo.
 */
export default function SceltaCampionati({
  id,
  scelti,
  onCambia,
}: {
  id: string
  scelti: string[]
  onCambia: (scelti: string[]) => void
}) {
  const contenitore = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const fuori = (e: MouseEvent) => {
      const el = contenitore.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('click', fuori)
    return () => document.removeEventListener('click', fuori)
  }, [])

  const commuta = (valore: string) => {
    onCambia(scelti.includes(valore) ? scelti.filter((v) => v !== valore) : [...scelti, valore])
  }

  // Con un campionato solo si scrive quale: è il caso più frequente, e
  // «1 campionato» costringerebbe ad aprire per ricordarsi quale.
  const riassunto =
    scelti.length === 0
      ? 'Tutti i campionati'
      : scelti.length === 1
        ? (CAMPIONATI.find((c) => c.id === scelti[0])?.nome ?? '1 campionato')
        : `${scelti.length} campionati`

  return (
    <details ref={contenitore} className="fm-scelta">
      <summary
        id={id}
        className={`fm-select fm-scelta-testa ${scelti.length > 0 ? 'fm-scelta-attivo' : ''}`}
      >
        <span className="truncate">{riassunto}</span>
        <span className="fm-scelta-freccia" aria-hidden="true">▾</span>
      </summary>

      <div className="fm-scelta-pannello">
        {scelti.length > 0 && (
          <button type="button" className="fm-scelta-azzera" onClick={() => onCambia([])}>
            Togli tutti i campionati
          </button>
        )}

        {CAMPIONATI.map((c) => (
          <label key={c.id} className="fm-scelta-voce">
            <input
              type="checkbox"
              checked={scelti.includes(c.id)}
              onChange={() => commuta(c.id)}
              className="shrink-0"
            />
            <span className="truncate">{c.nome}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
