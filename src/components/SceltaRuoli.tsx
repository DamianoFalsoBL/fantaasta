'use client'

import { useEffect, useRef } from 'react'
import { RUOLI_CLASSICI, opzioniMantra } from '@/utils/ruoli'

/**
 * Il filtro dei ruoli, a scelta multipla.
 *
 * Prende il posto della tendina a scelta singola: chiedendo **Dc e Ds** si
 * vogliono vedere i giocatori che possono fare l'uno **o** l'altro, e con una
 * tendina bisognava guardare due volte la stessa lista.
 *
 * ## Perché `<details>` e non una tendina costruita a mano
 *
 * Apertura e chiusura sono native: funzionano da tastiera, con lo schermo
 * letto, e senza stato React. Una tendina fatta a mano avrebbe voluto
 * `aria-expanded`, la gestione di Esc, del focus e del clic fuori — quattro
 * cose da tenere in piedi per riottenere ciò che il browser fa da sé. Resta
 * solo il clic fuori, che `<details>` non copre e che si aggiunge qui sotto.
 *
 * ## Perché non pastiglie sempre in vista
 *
 * Fra reparti e ruoli Mantra le voci sono fino a sedici. Su schermo grande i
 * filtri stanno **su una riga sola** — scelta presa a fine agosto — e sedici
 * pastiglie la spezzerebbero; sul telefono ruberebbero mezza schermata prima
 * della lista. Chiuso, questo occupa esattamente lo spazio della tendina che
 * sostituisce.
 */
export default function SceltaRuoli({
  id,
  scelti,
  onCambia,
  presenti,
}: {
  id: string
  scelti: string[]
  onCambia: (scelti: string[]) => void
  /** I ruoli Mantra davvero presenti nella lista, per non offrire voci vuote. */
  presenti: Set<string>
}) {
  const contenitore = useRef<HTMLDetailsElement>(null)

  // Il clic fuori chiude: è l'unica cosa che `<details>` non fa da sé, ed è
  // quella che manca di più — un pannello che resta aperto sopra la lista
  // mentre si guarda altrove sembra un difetto.
  useEffect(() => {
    const fuori = (e: MouseEvent) => {
      const el = contenitore.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('click', fuori)
    return () => document.removeEventListener('click', fuori)
  }, [])

  const mantra = opzioniMantra(presenti)
  const tutte = [...RUOLI_CLASSICI, ...mantra]

  const commuta = (valore: string) => {
    onCambia(scelti.includes(valore) ? scelti.filter((v) => v !== valore) : [...scelti, valore])
  }

  /**
   * Cosa si legge sul pulsante chiuso.
   *
   * Con un ruolo solo si scrive quale: è il caso più frequente, e «1 ruolo»
   * costringerebbe ad aprire per ricordarsi quale. Da due in su il nome per
   * esteso non ci sta, e il numero dice comunque che un filtro è attivo.
   */
  const riassunto =
    scelti.length === 0
      ? 'Tutti i ruoli'
      : scelti.length === 1
        ? (tutte.find((o) => o.valore === scelti[0])?.etichetta ?? '1 ruolo')
        : `${scelti.length} ruoli`

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
            Togli tutti i ruoli
          </button>
        )}

        <p className="fm-label fm-scelta-titolo">Reparto</p>
        {RUOLI_CLASSICI.map((o) => (
          <Voce key={o.valore} opzione={o} scelto={scelti.includes(o.valore)} onCambia={commuta} />
        ))}

        {mantra.length > 0 && (
          <>
            <p className="fm-label fm-scelta-titolo">Ruolo Mantra</p>
            {mantra.map((o) => (
              <Voce key={o.valore} opzione={o} scelto={scelti.includes(o.valore)} onCambia={commuta} />
            ))}
          </>
        )}
      </div>
    </details>
  )
}

function Voce({
  opzione,
  scelto,
  onCambia,
}: {
  opzione: { valore: string; etichetta: string }
  scelto: boolean
  onCambia: (valore: string) => void
}) {
  return (
    <label className="fm-scelta-voce">
      <input
        type="checkbox"
        checked={scelto}
        onChange={() => onCambia(opzione.valore)}
        className="shrink-0"
      />
      <span className="truncate">{opzione.etichetta}</span>
    </label>
  )
}
