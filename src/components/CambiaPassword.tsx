'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { messaggioErroreAuth } from '@/utils/erroriAuth'

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
/**
 * Un campo password con l'occhiolino che lo mostra in chiaro.
 *
 * Sta qui e non nel modulo perché i campi sono tre e il markup dell'occhiolino
 * è una dozzina di righe: copiarlo tre volte vuol dire tre posti dove
 * correggere lo stesso difetto, e tre modi di divergere.
 *
 * Il pulsante è `tabIndex={-1}` come nel modulo di accesso
 * (`LoginForm.tsx`): passando da un campo all'altro con Tab non ci si
 * inciampa. Resta comunque raggiungibile col dito e col mouse.
 *
 * **Vederla in chiaro serve più di quanto sembri.** Una password incollata
 * porta con sé uno spazio invisibile, e in un campo a pallini non c'è modo di
 * accorgersene: è già costato un manager che non riusciva più a entrare.
 */
function CampoPassword({
  id,
  etichetta,
  valore,
  onCambia,
  autoComplete,
  minLength,
}: {
  id: string
  etichetta: React.ReactNode
  valore: string
  onCambia: (v: string) => void
  autoComplete: string
  minLength?: number
}) {
  const [inChiaro, setInChiaro] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="fm-label mb-1 block">{etichetta}</label>
      <div className="relative">
        <input
          id={id}
          type={inChiaro ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          className="fm-input pr-10"
          value={valore}
          onChange={(e) => onCambia(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setInChiaro((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-dim transition hover:text-ink"
          tabIndex={-1}
          aria-label={inChiaro ? 'Nascondi la password' : 'Mostra la password'}
        >
          {inChiaro ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  )
}

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

    // Gli spazi ai bordi si tolgono prima di qualunque controllo.
    //
    // Provato contro Supabase: una password che finisce con uno spazio viene
    // accettata senza obiezioni, e poi la stessa password digitata senza
    // spazio NON entra piu'. Sul telefono lo spazio arriva da solo — dopo un
    // suggerimento della tastiera, o incollando — e resta invisibile in un
    // campo con i pallini. Chi ci finisce dentro non ha modo di accorgersene.
    //
    // Si taglia anche l'attuale, e si puo' farlo senza rischi: le password che
    // arrivano dall'import passano da `testo()`, che gia' toglie gli spazi, e
    // quelle generate dal reset sono [a-z2-9]{4}-[a-z2-9]{4}. L'unica fonte
    // possibile di una password con lo spazio era questo modulo.
    const attualePulita = attuale.trim()
    const nuovaPulita = nuova.trim()
    const confermaPulita = conferma.trim()

    if (nuovaPulita.length < LUNGHEZZA_MINIMA) {
      setEsito({ tono: 'errore', testo: `La nuova password deve avere almeno ${LUNGHEZZA_MINIMA} caratteri.` })
      return
    }
    if (nuovaPulita !== confermaPulita) {
      setEsito({ tono: 'errore', testo: 'Le due nuove password non coincidono.' })
      return
    }
    if (nuovaPulita === attualePulita) {
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
    const { error: erroreAccesso } = await supabase.auth.signInWithPassword({ email, password: attualePulita })
    if (erroreAccesso) {
      setEsito({ tono: 'errore', testo: 'La password attuale non è corretta.' })
      setInCorso(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: nuovaPulita })
    if (error) {
      setEsito({ tono: 'errore', testo: `Non è stato possibile cambiarla: ${messaggioErroreAuth(error)}` })
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
          <CampoPassword
            id="pw-attuale"
            etichetta="Password attuale"
            valore={attuale}
            onCambia={setAttuale}
            autoComplete="current-password"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoPassword
              id="pw-nuova"
              etichetta={`Nuova password (almeno ${LUNGHEZZA_MINIMA} caratteri)`}
              valore={nuova}
              onCambia={setNuova}
              autoComplete="new-password"
              minLength={LUNGHEZZA_MINIMA}
            />
            <CampoPassword
              id="pw-conferma"
              etichetta="Ripeti la nuova password"
              valore={conferma}
              onCambia={setConferma}
              autoComplete="new-password"
              minLength={LUNGHEZZA_MINIMA}
            />
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
