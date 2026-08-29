'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { aggiungiPreferito, togliPreferito } from '@/utils/preferiti'

/**
 * La stellina che mette un giocatore fra i preferiti.
 *
 * È un `<button>` con `aria-pressed` e non un contenitore cliccabile: si deve
 * poter raggiungere con la tastiera, e chi usa un lettore di schermo deve
 * sentire se è premuta o no.
 *
 * L'aggiornamento è **ottimistico**: la stella si accende subito e torna
 * indietro se la scrittura fallisce. Su una lista di 215 righe aspettare il
 * viaggio di andata e ritorno a ogni tocco si sentirebbe, e il caso normale è
 * che vada a buon fine.
 *
 * Chi non ha una squadra non la vede affatto — se ne occupa chi la disegna.
 * Il super admin ha `squadra_id` nullo: `mia_squadra_id()` restituirebbe NULL e
 * la policy rifiuterebbe ogni scrittura. Meglio non disegnarla che farla
 * fallire.
 */
export default function StellaPreferito({
  giocatoreId,
  squadraId,
  nome,
  attiva,
  onCambia,
}: {
  giocatoreId: number
  squadraId: string
  /** Serve solo all'etichetta per i lettori di schermo. */
  nome: string
  attiva: boolean
  /** Comunica il nuovo stato a chi tiene l'elenco. */
  onCambia: (giocatoreId: number, ora: boolean) => void
}) {
  const [inCorso, setInCorso] = useState(false)

  const premi = async (e: React.MouseEvent) => {
    // La riga attorno potrebbe avere un suo clic (in /buste seleziona il
    // giocatore): la stella non deve farlo scattare.
    e.stopPropagation()
    if (inCorso) return

    const nuovo = !attiva
    setInCorso(true)
    onCambia(giocatoreId, nuovo)

    const supabase = createClient()
    const errore = nuovo
      ? await aggiungiPreferito(supabase, squadraId, giocatoreId)
      : await togliPreferito(supabase, squadraId, giocatoreId)

    // Se il server rifiuta si torna com'era: una stella accesa che a database
    // non esiste farebbe contare al manager preferiti che non ha.
    if (errore) onCambia(giocatoreId, attiva)
    setInCorso(false)
  }

  return (
    <button
      type="button"
      onClick={premi}
      aria-pressed={attiva}
      aria-label={attiva ? `Togli ${nome} dai preferiti` : `Aggiungi ${nome} ai preferiti`}
      title={attiva ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
      /* Margine verticale negativo come per gli altri comandi dentro le righe:
         il bersaglio resta grande abbastanza per un dito, ma non alza la riga.
         Misurato: con `text-base` e `-my-1` la scheda di /svincolati passava da
         76 a 78px, e quei due pixel per 215 righe sono mezza schermata. */
      className={`-my-1.5 -mr-1.5 shrink-0 rounded-sm px-2.5 py-1.5 text-sm leading-none transition ${
        attiva ? 'text-ambra' : 'text-ink-dim opacity-50 hover:opacity-100'
      }`}
    >
      {attiva ? '★' : '☆'}
    </button>
  )
}
