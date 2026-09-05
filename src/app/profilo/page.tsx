import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import CambiaPassword from '@/components/CambiaPassword'

export const dynamic = 'force-dynamic'

/**
 * Il proprio profilo.
 *
 * Il cambio password stava in fondo a `/mia-rosa`, con un commento che
 * spiegava la scelta: «è la pagina che parla di te, e il menu era stato
 * sfoltito apposta». La ragione era buona ma l'effetto no — chi cerca dove si
 * cambia la password non pensa a scorrere la propria rosa fino in fondo, sotto
 * la tabella dei giocatori e il riquadro dei trasferimenti.
 *
 * **Il menu resta sfoltito lo stesso**, ed è il motivo per cui questa pagina
 * non ha una voce propria: ci si arriva dal chip col proprio nome nella barra,
 * che è dove si va a cercare le proprie cose e che prima non portava da
 * nessuna parte.
 *
 * Pagina server: qui non c'è niente in tempo reale, e l'unica parte che
 * scrive — `CambiaPassword` — è già un componente client per conto suo.
 */
export default async function ProfiloPage() {
  // `requireUtente` porta già ruolo e `squadra_id`: qui manca solo la squadra,
  // e la si legge per id invece di ripassare da `profili`.
  const profilo = await requireUtente()
  const supabase = await createClient()

  const { data: squadra } = profilo.squadra_id
    ? await supabase
        .from('squadre')
        .select('nome, crediti_residui, slot_occupati')
        .eq('id', profilo.squadra_id)
        .maybeSingle()
    : { data: null }

  return (
    <div className="fm-pagina fm-pagina-stretta space-y-4">
      <div>
        <h1 className="fm-title text-2xl sm:text-3xl">Il tuo profilo</h1>
        <p className="mt-1 text-sm text-ink-mid">
          Chi sei in questa lega, e dove si cambia la password.
        </p>
      </div>

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>La tua fantasquadra</span>
          {/* Il ruolo si vede solo se non è il ruolo normale: dire «MANAGER» a
              tutti e dieci non aggiunge niente a quel che già sanno. */}
          {profilo.ruolo !== 'MANAGER' && (
            <span className="fm-chip fm-chip-ambra shrink-0">{profilo.ruolo.replace('_', ' ')}</span>
          )}
        </div>

        <div className="fm-panel-body">
          {squadra ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {/* Niente `LogoSquadra` qui: quel componente mappa i club di
                  Serie A e delle leghe estere, non le fantasquadre. Su
                  «Sossai Red Dragons» non troverebbe nulla e non disegnerebbe
                  niente — un componente inerte che sembra funzionare. Il logo
                  della fantasquadra e' una cosa che ancora non esiste. */}
              <span className="fm-nome truncate text-lg">{squadra.nome}</span>
              <div className="flex gap-6">
                <div>
                  <p className="fm-metric-label">Crediti residui</p>
                  <p className="fm-metric-value">{squadra.crediti_residui}</p>
                </div>
                <div>
                  <p className="fm-metric-label">Giocatori in rosa</p>
                  <p className="fm-metric-value">{squadra.slot_occupati}</p>
                </div>
              </div>
            </div>
          ) : (
            /* Il super admin non ha una squadra: `mia_squadra_id()` è NULL e
               non partecipa all'asta. Va detto, invece di mostrare un
               riquadro vuoto che sembra un caricamento mai finito. */
            <p className="text-sm text-ink-mid">
              Questo account non ha una fantasquadra: amministra la lega senza giocarci.
            </p>
          )}
        </div>
      </div>

      <CambiaPassword />
    </div>
  )
}
