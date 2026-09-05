'use client'

import { useEffect, useRef } from 'react'
import { avvisoTurno, descriviTurno } from '@/utils/ordineChiamata'

/**
 * L'ordine di chiamata: chi tocca adesso e quanto manca al proprio turno.
 *
 * Stava scritto dentro `TabelloneAsta`, nel ramo `if (!asta)`. Vuol dire che
 * appena un'asta partiva il componente passava alla vista di rilancio e la
 * barra spariva del tutto **per i manager** — l'admin invece non la perde mai,
 * perche' il suo pannello in `/admin/asta` non ha quella condizione. Da qui la
 * richiesta: durante un'asta viva la domanda «quando tocca a me» resta, e anzi
 * e' proprio il momento in cui ci si prepara.
 *
 * Un componente solo con due vestiti, non due copie: la parte che si sbaglia
 * non e' il disegno, e' il conto di chi manca da chiamare — e quello qui e'
 * scritto una volta.
 */
type Props = {
  ordine: string[]
  /** Posizione di turno, contata da 1 come in `regole_lega.indice_chiamata`. */
  indice: number
  /** Chi ha ancora qualcuno da chiamare: le altre spariscono dalla fila. */
  attive: Set<string>
  nomi: Record<string, string>
  squadraId: string | null
  isMioTurno: boolean
  /** Con un'asta viva: una riga sola, senza le pastiglie. */
  compatta?: boolean
}

export default function BarraOrdine({
  ordine, indice, attive, nomi, squadraId, isMioTurno, compatta = false,
}: Props) {
  // Su telefono la fila scorre in orizzontale: con quattordici squadre quella
  // di turno finisce facilmente fuori campo, e la domanda «a chi tocca?» resta
  // senza risposta finche' non si trascina. La si porta in vista da se'.
  const turnoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    turnoRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [indice, ordine])

  if (ordine.length === 0) return null

  const { daChiamare, concluse, turno, dopo, turniMancanti } =
    descriviTurno(ordine, indice, attive, squadraId)
  const nomeTurno = nomi[turno ?? ''] || 'Squadra'
  const avviso = avvisoTurno(turniMancanti, isMioTurno)

  if (compatta) {
    return (
      <div className={`fm-panel flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 ${
        isMioTurno ? 'border-neon/40' : ''
      }`}>
        <span className="fm-label shrink-0">Ordine di chiamata</span>
        <span className="min-w-0 text-sm text-ink-mid">
          Turno di <strong className="font-semibold text-ink">{nomeTurno}</strong>
          {dopo && <> · poi <strong className="font-semibold text-ink">{nomi[dopo] || 'Squadra'}</strong></>}
        </span>
        {avviso && (
          <span className={`fm-label ml-auto shrink-0 normal-case tracking-normal ${
            isMioTurno ? 'text-neon' : ''
          }`}>
            {avviso}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="fm-panel overflow-hidden">
      <div className="fm-panel-head">
        <span>Ordine di chiamata</span>
        {concluse > 0 && (
          <span className="fm-label normal-case tracking-normal">
            {concluse} {concluse === 1 ? 'squadra ha' : 'squadre hanno'} completato
          </span>
        )}
      </div>

      {/* La riga che risponde alla domanda, prima delle pastiglie: leggere «a
          chi tocca» dal colore di una pillola in una fila che scorre non
          funziona, tanto meno su un telefono. Qui si risponde a parole. */}
      <div
        className={`flex items-baseline justify-between gap-3 border-b px-3 py-2.5 ${
          isMioTurno ? 'border-neon/40 bg-neon/10' : 'border-line bg-panel-hi'
        }`}
      >
        <span className={`fm-title text-base ${isMioTurno ? 'text-neon' : 'text-ink'}`}>
          {isMioTurno ? 'Tocca a te' : `Tocca a ${nomeTurno}`}
        </span>
        {!isMioTurno && avviso && (
          <span className="fm-label shrink-0 normal-case tracking-normal">{avviso}</span>
        )}
      </div>

      {/* Su schermo stretto la barra scorre invece di andare a capo: con 14
          squadre, andando a capo si mangiava mezzo schermo. */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2.5 md:flex-wrap md:overflow-visible">
        {daChiamare.map((sqId) => {
          const posizione = ordine.indexOf(sqId) + 1
          const isTurno = posizione === indice
          const isMe = sqId === squadraId
          return (
            <div
              key={sqId}
              ref={isTurno ? turnoRef : undefined}
              /* Niente scale: ingrandendo la pillola di turno finiva sopra a
                 quella accanto. L'anello invece non occupa spazio nel flusso,
                 quindi non spinge le vicine. */
              className={`fm-chip shrink-0 ${
                isTurno
                  ? 'fm-chip-attivo ring-2 ring-neon ring-offset-2 ring-offset-panel'
                  : isMe
                    ? 'fm-chip-mia'
                    : 'opacity-60'
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                isTurno ? 'bg-void text-neon' : 'bg-panel-hover text-ink-dim'
              }`}>
                {posizione}
              </span>
              {nomi[sqId] || 'Squadra'}{isMe && ' (Tu)'}
            </div>
          )
        })}
      </div>
    </div>
  )
}
