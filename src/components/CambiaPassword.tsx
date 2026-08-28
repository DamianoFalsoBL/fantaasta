'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

/** Il minimo che impone Supabase. Scritto qui e mostrato nel modulo, così non
 *  lo si scopre da un errore dopo aver premuto. */
const LUNGHEZZA_MINIMA = 6

/**
 * Il manager si cambia la password da solo.
 *
 * `supabase.auth.updateUser` basta la sessione attiva: niente chiave di
 * servizio, niente modifiche al database.
 *
 * Si chiede però anche la password ATTUALE, che Supabase non pretenderebbe.
 * Qui le sessioni restano aperte sui telefoni per settimane, e fra amici la
 * sessione aperta di qualcun altro è una tentazione: verificarla costa una
 * chiamata e toglie lo scherzo.
 *
 * Nessun requisito di complessità, di proposito: è una lega di dieci persone
 * su un sito senza dati sensibili, e l'unico effetto sarebbe far scegliere a
 * tutti la stessa password con un punto esclamativo in fondo.
 */
export default function CambiaPassword() {
  const supabase = createClient()
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [conferma, setConferma] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState<{ tono: 'ok' | 'errore'; testo: string } | null>(null)

  const invia = async (e: React.FormEvent) => {
    e.preventDefault()
    setEsito(null)

    if (nuova.length < LUNGHEZZA_MINIMA) {
      setEsito({ tono: 'errore', testo: `La nuova password deve avere almeno ${LUNGHEZZA_MINIMA} caratteri.` })
      return
    }
    if (nuova !== conferma) {
      setEsito({ tono: 'errore', testo: 'Le due nuove password non coincidono.' })
      return
    }
    if (nuova === attuale) {
      setEsito({ tono: 'errore', testo: 'La nuova password è uguale a quella attuale.' })
      return
    }

    setInCorso(true)

    const { data: utente } = await supabase.auth.getUser()
    const email = utente.user?.email
    if (!email) {
      setEsito({ tono: 'errore', testo: 'Sessione non valida: esci e rientra.' })
      setInCorso(false)
      return
    }

    // La verifica della password attuale. Rientrare con le stesse credenziali
    // sostituisce la sessione con una nuova dello stesso utente: innocuo, ed è
    // l'unico modo di controllare la password senza mandarla a un endpoint
    // nostro.
    const { error: erroreAccesso } = await supabase.auth.signInWithPassword({ email, password: attuale })
    if (erroreAccesso) {
      setEsito({ tono: 'errore', testo: 'La password attuale non è corretta.' })
      setInCorso(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: nuova })
    if (error) {
      setEsito({ tono: 'errore', testo: `Non è stato possibile cambiarla: ${error.message}` })
    } else {
      setEsito({ tono: 'ok', testo: 'Password cambiata. La prossima volta entra con quella nuova.' })
      setAttuale('')
      setNuova('')
      setConferma('')
    }
    setInCorso(false)
  }

  return (
    <div className="fm-panel overflow-hidden">
      <details>
        {/* Chiusa di default: si cambia la password una volta ogni tanto, e
            questa è la pagina della rosa. */}
        <summary className="fm-panel-head cursor-pointer list-none">
          <span>Cambia la tua password</span>
          <span className="fm-label">apri ▾</span>
        </summary>

        <form onSubmit={invia} className="fm-panel-body space-y-3">
          <div>
            <label htmlFor="pw-attuale" className="fm-label mb-1 block">Password attuale</label>
            <input
              id="pw-attuale"
              type="password"
              autoComplete="current-password"
              className="fm-input"
              value={attuale}
              onChange={(e) => setAttuale(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pw-nuova" className="fm-label mb-1 block">
                Nuova password (almeno {LUNGHEZZA_MINIMA} caratteri)
              </label>
              <input
                id="pw-nuova"
                type="password"
                autoComplete="new-password"
                minLength={LUNGHEZZA_MINIMA}
                className="fm-input"
                value={nuova}
                onChange={(e) => setNuova(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="pw-conferma" className="fm-label mb-1 block">Ripeti la nuova password</label>
              <input
                id="pw-conferma"
                type="password"
                autoComplete="new-password"
                minLength={LUNGHEZZA_MINIMA}
                className="fm-input"
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                required
              />
            </div>
          </div>

          {esito && (
            <div className={`fm-alert text-sm font-semibold ${esito.tono === 'ok' ? 'fm-alert-ok' : 'fm-alert-danger'}`}>
              {esito.testo}
            </div>
          )}

          <button type="submit" disabled={inCorso} className="fm-btn fm-btn-primary">
            {inCorso ? 'Cambio in corso…' : 'Cambia password'}
          </button>

          <p className="text-xs text-ink-dim">
            Se la dimentichi non c&apos;è un «password dimenticata»: gli account non hanno
            un indirizzo email vero a cui scrivere. Chiedi all&apos;amministratore di lega.
          </p>
        </form>
      </details>
    </div>
  )
}
