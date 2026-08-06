'use client'

import { useEffect, useRef } from 'react'

/**
 * Finestra di conferma in tema, al posto di `confirm()`.
 *
 * Le finestre native hanno due difetti che qui pesano entrambi:
 * sono disegnate dal sistema operativo e restano bianche dentro un'app scura,
 * e i browser pilotati in automazione le respingono da soli, rendendo le
 * azioni admin impossibili da provare.
 *
 * Riprende il modello della modale già usata per l'hard reset, aggiungendo
 * quello che lì mancava: chiusura con Esc, click sullo sfondo, e focus
 * spostato sul pulsante di conferma all'apertura.
 */
export type TonoConferma = 'neutro' | 'pericolo'

export default function Conferma({
  aperta,
  titolo,
  messaggio,
  testoConferma = 'Conferma',
  testoAnnulla = 'Annulla',
  tono = 'neutro',
  soloConferma = false,
  onConferma,
  onAnnulla,
}: {
  aperta: boolean
  titolo: string
  messaggio: React.ReactNode
  testoConferma?: string
  testoAnnulla?: string
  tono?: TonoConferma
  /** Un solo pulsante: la finestra comunica un esito, non chiede una scelta. */
  soloConferma?: boolean
  onConferma: () => void
  onAnnulla: () => void
}) {
  const bottoneRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!aperta) return
    bottoneRef.current?.focus()
    const chiudi = (e: KeyboardEvent) => { if (e.key === 'Escape') onAnnulla() }
    document.addEventListener('keydown', chiudi)
    return () => document.removeEventListener('keydown', chiudi)
  }, [aperta, onAnnulla])

  if (!aperta) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      onClick={onAnnulla}
      role="presentation"
    >
      <div
        className="fm-panel w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conferma-titolo"
      >
        <div className={`fm-panel-head ${tono === 'pericolo' ? 'fm-panel-head--rosso' : ''}`}>
          <span id="conferma-titolo">{titolo}</span>
        </div>

        <div className="fm-panel-body">
          <div className="text-sm text-ink-mid">{messaggio}</div>

          <div className="mt-5 flex gap-2">
            {!soloConferma && (
              <button onClick={onAnnulla} className="fm-btn fm-btn-ghost flex-1">
                {testoAnnulla}
              </button>
            )}
            <button
              ref={bottoneRef}
              onClick={onConferma}
              className={`fm-btn flex-1 ${tono === 'pericolo' ? 'fm-btn-danger' : 'fm-btn-primary'}`}
            >
              {testoConferma}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
