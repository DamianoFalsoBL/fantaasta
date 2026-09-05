'use client'

import { useMemo, useState } from 'react'
import {
  ordinaSquadre,
  OPZIONI_STAT,
  type ColonnaStat,
  type RigaSquadra,
} from '@/utils/statistiche'

/**
 * La tabella delle squadre, con la tendina dell'ordinamento.
 *
 * È l'unica parte client della pagina: i conti li fa il server, qui si
 * riordina soltanto. Tendina e non intestazioni cliccabili perché su telefono
 * `.fm-table-cards` nasconde il `thead` — un ordinamento comandato da lì
 * sparirebbe proprio dove la tabella si legge peggio. Stessa scelta di
 * `/svincolati` e `/aste`.
 *
 * Schede **etichettate** e non compatte, al contrario di `/aste`: lì le celle
 * in fila si capiscono dall'unità dentro il valore ("27 anni", "10 cr"), qui
 * sono sei numeri che si distinguono solo per il nome della colonna. Senza
 * etichetta, su telefono, sarebbero sei cifre in fila senza significato.
 */
export default function StatisticheClient({ righe }: { righe: RigaSquadra[] }) {
  const [ordine, setOrdine] = useState('eta:asc')

  const ordinate = useMemo(() => {
    const [colonna, verso] = ordine.split(':') as [ColonnaStat, 'asc' | 'desc']
    return ordinaSquadre(righe, colonna, verso)
  }, [righe, ordine])

  const nessunAcquisto = righe.every((r) => r.presiInAsta === 0)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="ordine-stat" className="fm-label">Ordina per</label>
        <select
          id="ordine-stat"
          className="fm-select w-auto"
          value={ordine}
          onChange={(e) => setOrdine(e.target.value)}
        >
          {OPZIONI_STAT.map((o) => (
            <option key={o.valore} value={o.valore}>{o.etichetta}</option>
          ))}
        </select>
      </div>

      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards">
          <thead>
            <tr>
              <th>Squadra</th>
              <th className="fm-num">Età media</th>
              <th className="fm-num">Quot. media</th>
              <th className="fm-num">Spesi in asta</th>
              <th className="fm-num">Media acquisto</th>
              <th className="fm-num">Sul listino</th>
              <th className="fm-num">Residui</th>
            </tr>
          </thead>
          <tbody>
            {ordinate.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="fm-nome flex flex-wrap items-center gap-2">
                      {r.nome}
                      {/* Compare solo quando i conti non tornano: un avviso
                          che c'è sempre non lo legge più nessuno. */}
                      {!r.quadra && (
                        <span
                          className="fm-badge fm-badge-bad"
                          title="La spesa ricostruita non coincide con budget iniziale meno crediti residui"
                        >
                          conti da rivedere
                        </span>
                      )}
                    </span>
                    {/* Corto di proposito: `.fm-label` è maiuscoletto spaziato,
                        e questa riga detta la larghezza della prima colonna —
                        che sotto i 1024px è anche quella fissa durante lo
                        scorrimento laterale. L'intervallo di età sta nella sua
                        cella, dove il numero lo spiega da solo. */}
                    <span className="fm-label">
                      {r.giocatori} in rosa · {r.presiInAsta} in asta
                    </span>
                  </div>
                </td>
                <td data-label="Età media" className="fm-num">
                  {r.etaMedia !== null ? r.etaMedia.toFixed(1) : '—'}
                  {r.etaMin !== null && r.etaMax !== null && (
                    <span className="ml-1 text-xs font-normal text-ink-dim">
                      {r.etaMin}–{r.etaMax}
                    </span>
                  )}
                </td>
                <td data-label="Quot. media" className="fm-num">
                  {r.quotMedia !== null ? r.quotMedia.toFixed(1) : '—'}
                </td>
                <td data-label="Spesi in asta" className="fm-num">
                  {r.spesoInAsta} <span className="text-xs font-normal text-ink-dim">cr</span>
                </td>
                <td data-label="Media acquisto" className="fm-num">
                  {r.mediaAsta !== null ? r.mediaAsta.toFixed(1) : '—'}
                </td>
                <td data-label="Sul listino" className="fm-num">
                  {r.rapportoListino !== null ? `${r.rapportoListino.toFixed(2)}×` : '—'}
                </td>
                <td data-label="Residui" className="fm-num">
                  {r.creditiResidui}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nessunAcquisto && (
        <p className="mt-3 text-sm text-ink-dim">
          Nessun giocatore è ancora stato preso in questa asta: le colonne della
          spesa restano a zero finché non si chiude la prima chiamata o il primo
          spoglio delle buste.
        </p>
      )}
    </>
  )
}
