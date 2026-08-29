'use client'
import { useState, type ReactNode } from 'react'

/**
 * I filtri delle liste: la ricerca sempre in vista, il resto dietro un
 * pulsante sul telefono.
 *
 * Prima erano tutti aperti — cinque comandi impilati su /svincolati, tre più
 * due caselle su /aste — e insieme ai riquadri di riepilogo spingevano il primo
 * giocatore oltre metà schermo. Su un telefono si vedeva un giocatore e mezzo.
 *
 * Aperto su schermo grande e chiuso sul telefono SENZA misurare la finestra:
 * l'area richiudibile è `hidden md:grid` da chiusa e `grid` da aperta, e il
 * pulsante è `md:hidden`. Misurare la larghezza in JavaScript vorrebbe dire
 * disegnare prima una versione sbagliata e correggerla dopo, con il salto che
 * ne consegue.
 */
export default function PannelloFiltri({
  ricerca,
  attivi,
  onAzzera,
  griglia = 'md:grid-cols-3',
  children,
}: {
  /** Il campo di ricerca: resta fuori, è quello che si usa quasi sempre. */
  ricerca: ReactNode
  /** Quanti filtri sono attivi oltre la ricerca. */
  attivi: number
  onAzzera: () => void
  /**
   * Le colonne su schermo grande. **Contano anche la ricerca**, che da md in su
   * entra nella griglia: se una pagina ha tre filtri servono quattro colonne.
   */
  griglia?: string
  children: ReactNode
}) {
  const [aperto, setAperto] = useState(false)

  return (
    /* Su schermo grande i due contenitori interni diventano `contents`: le
       scatole spariscono e i loro figli entrano tutti nella STESSA griglia,
       quindi ricerca e filtri stanno su una riga sola e allineati fra loro.
       Sotto md i contenitori restano scatole vere, e il telefono conserva la
       ricerca sopra e il pannello richiudibile sotto — che e' l'unica
       disposizione che ci sta. */
    <div className={`mb-4 rounded-md border border-line bg-panel-hi p-3 md:grid md:gap-3 ${griglia}`}>
      <div className="flex items-end gap-2 md:contents">
        <div className="min-w-0 flex-1">{ricerca}</div>
        <button
          type="button"
          onClick={() => setAperto(!aperto)}
          aria-expanded={aperto}
          aria-controls="pannello-filtri"
          className="fm-btn fm-btn-ghost shrink-0 md:hidden"
        >
          Filtri
          {/* Il conteggio sul pulsante, non dentro il pannello: un filtro
              dimenticato dietro un pannello chiuso è il modo classico di
              guardare una lista vuota senza capire perché. */}
          {attivi > 0 && <span className="fm-badge fm-badge-top ml-1.5">{attivi}</span>}
        </button>
      </div>

      <div
        id="pannello-filtri"
        className={`gap-3 ${griglia} ${aperto ? 'mt-3 grid' : 'hidden'} md:contents`}
      >
        {children}

        {attivi > 0 && (
          <div className="flex items-end md:col-span-full md:justify-end">
            <button type="button" onClick={onAzzera} className="fm-btn fm-btn-ghost fm-btn-sm">
              Azzera filtri
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
