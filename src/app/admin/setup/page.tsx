'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { importBudget, importListone, importAste, ricalcolaSlot, type RisultatoImport } from '../actions'
import Conferma from '@/components/Conferma'
import { trasferimentiAttivi } from '@/utils/trasferimenti'

function Uploader({ title, description, avviso, action }: {
  title: string,
  description: string,
  /** Cosa il caricamento DISTRUGGE, quando è irreversibile. Vedi sotto. */
  avviso?: React.ReactNode,
  action: (formData: FormData) => Promise<RisultatoImport>
}) {
  const [status, setStatus] = useState<{type: 'idle' | 'loading' | 'success' | 'error', message: string, dettagli?: string[]}>({ type: 'idle', message: '' })

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus({ type: 'loading', message: 'Importazione in corso...' })

    const formData = new FormData(e.currentTarget)

    // Senza try/catch, se la server action lanciava, l'interfaccia restava
    // bloccata per sempre su "Importazione in corso...".
    try {
      const result = await action(formData)
      if (result?.error) {
        setStatus({ type: 'error', message: result.error, dettagli: result.dettagli })
      } else {
        setStatus({ type: 'success', message: result?.success ?? 'Completato.', dettagli: result?.dettagli })
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message || 'Errore imprevisto durante l\'importazione.' })
    }
  }

  return (
    /* Colonna flessibile perché il modulo possa scendere in fondo (`mt-auto`
       sul form). Le schede della griglia si allungano tutte all'altezza della
       più alta: senza questo, quella con l'avviso lasciava l'altra con 166px di
       vuoto e i due pulsanti "Importa" sfalsati di 149px. */
    <div className="fm-panel flex flex-col p-4">
      <h3 className="fm-title text-base">{title}</h3>
      <p className="mb-3 mt-1 text-sm text-ink-mid">{description}</p>

      {/* La descrizione dice cosa il file PORTA; questo dice cosa il
          caricamento TOGLIE. Erano due cose diverse e ne veniva scritta una
          sola, quindi il caso peggiore — colonne mancanti nel file, rose
          azzerate e non ricostruite — non era annunciato da nessuna parte. */}
      {avviso && (
        <div className="fm-alert fm-alert-warn mb-3 text-sm">{avviso}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-auto space-y-3">
        {/* `.fm-file` ritematizza ::file-selector-button, che non eredita
            nulla dal genitore e resterebbe col tema chiaro del browser. */}
        <input
          type="file"
          name="file"
          accept=".xlsx, .csv"
          required
          className="fm-file block w-full text-sm text-ink-mid"
        />
        <button
          type="submit"
          disabled={status.type === 'loading'}
          className="fm-btn fm-btn-primary"
        >
          {status.type === 'loading' ? 'Caricamento in corso…' : 'Importa file'}
        </button>
      </form>

      {status.message && (
        <div className={`fm-alert mt-3 ${status.type === 'error' ? 'fm-alert-danger' : 'fm-alert-ok'}`}>
          <p className="font-semibold">{status.message}</p>
          {status.dettagli && status.dettagli.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 font-normal">
              {status.dettagli.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

type ProfiloRiga = {
  id: string
  ruolo: 'ADMIN' | 'MANAGER'
  squadra_id: string | null
  squadre: { nome: string } | null
}

export default function AdminSetupPage() {
  const supabase = createClient()
  const [profili, setProfili] = useState<ProfiloRiga[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Al posto di `alert()`: le finestre native non sono stilizzabili e i
  // browser in automazione le respingono.
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)
  // Tetto ai portieri. Vive in regole_lega.slot_p, che esisteva gia' ma era
  // informativa: dalla migration 20260806210000 e' vincolante.
  const [maxPortieri, setMaxPortieri] = useState('')
  // I due contatori d'asta. Erano un unico valore scritto a mano nel database.
  const [timerPrimo, setTimerPrimo] = useState('')
  const [timerRilancio, setTimerRilancio] = useState('')
  // I trasferimenti sono una funzione, non una fase: da spenta le pagine
  // spariscono dai menu invece di mostrarsi disabilitate.
  const [trasferimentiOn, setTrasferimentiOn] = useState(false)
  const [azione, setAzione] = useState<{ titolo: string; messaggio: React.ReactNode; testoConferma: string; pericolo?: boolean; esegui: () => Promise<void> } | null>(null)

  // L'accesso è già garantito dal gate server-side in setup/layout.tsx:
  // qui non serve più ricontrollare il ruolo lato client.
  const fetchProfili = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profili')
      .select('id, ruolo, squadra_id, squadre(nome)')
      .neq('ruolo', 'SUPER_ADMIN')

    if (error) setError(error.message)
    // L'ordine si fa qui e non nella query: ordinare per `squadra_id`
    // significava ordinare per UUID, cioè non ordinare affatto, e PostgREST non
    // sa ordinare le righe padre per una colonna incorporata. Le righe sono
    // quattordici, il costo è nullo. Chi non ha squadra finisce in fondo.
    else setProfili(((data as unknown as ProfiloRiga[]) || []).sort((a, b) => {
      const na = a.squadre?.nome ?? ''
      const nb = b.squadre?.nome ?? ''
      if (na === '') return nb === '' ? 0 : 1
      if (nb === '') return -1
      return na.localeCompare(nb, 'it')
    }))

    const { data: regole } = await supabase
      .from('regole_lega')
      .select('slot_p, durata_timer, durata_timer_rilancio')
      .limit(1)
      .maybeSingle()
    if (regole) {
      setMaxPortieri(String(regole.slot_p))
      setTimerPrimo(String(regole.durata_timer))
      setTimerRilancio(String(regole.durata_timer_rilancio))
    }

    setTrasferimentiOn(await trasferimentiAttivi(supabase))

    setLoading(false)
  }

  useEffect(() => {
    fetchProfili()
  }, [])

  const handleHardReset = async () => {
    if (confirmText !== 'CONFERMO') return
    setLoading(true)
    const { error: rpcErr } = await supabase.rpc('hard_reset_sistema')
    if (rpcErr) {
      setEsito({ tipo: 'errore', testo: `Errore durante il reset: ${rpcErr.message}` })
    } else {
      setEsito({ tipo: 'ok', testo: 'Reset completato. Squadre, aste e giocatori sono stati eliminati.' })
      setShowConfirmModal(false)
      setConfirmText('')
      fetchProfili()
    }
    setLoading(false)
  }

  const salvaMaxPortieri = async () => {
    const valore = parseInt(maxPortieri, 10)
    if (Number.isNaN(valore)) {
      setEsito({ tipo: 'errore', testo: 'Inserisci un numero.' })
      return
    }
    const { error: rpcErr } = await supabase.rpc('admin_imposta_max_portieri', { p_max: valore })
    if (rpcErr) setEsito({ tipo: 'errore', testo: rpcErr.message })
    else {
      setEsito({ tipo: 'ok', testo: `Massimo portieri impostato a ${valore}.` })
      await fetchProfili()
    }
  }

  const salvaTimer = async () => {
    const primo = parseInt(timerPrimo, 10)
    const rilancio = parseInt(timerRilancio, 10)
    if (Number.isNaN(primo) || Number.isNaN(rilancio)) {
      setEsito({ tipo: 'errore', testo: 'Inserisci due numeri.' })
      return
    }
    const { error: rpcErr } = await supabase.rpc('admin_imposta_timer', {
      p_primo: primo,
      p_rilancio: rilancio,
    })
    if (rpcErr) setEsito({ tipo: 'errore', testo: rpcErr.message })
    else {
      setEsito({ tipo: 'ok', testo: `Contatore: ${primo}s alla chiamata, ${rilancio}s dopo un rilancio.` })
      await fetchProfili()
    }
  }

  const toggleTrasferimenti = async () => {
    const nuovoStato = !trasferimentiOn

    // Il conteggio arriva dal server e non da una query qui: la policy su
    // offerte_trasferimento mostra a ciascuno solo le proprie trattative, e il
    // super admin non è parte di nessuna. Letto dal browser sarebbe sempre zero,
    // cioè proprio il numero che non deve essere sbagliato.
    let inSospeso = 0
    if (!nuovoStato) {
      const { data } = await supabase.rpc('trattative_in_sospeso')
      inSospeso = data ?? 0
    }

    setAzione({
      titolo: nuovoStato ? 'Attivare i trasferimenti' : 'Disattivare i trasferimenti',
      pericolo: !nuovoStato && inSospeso > 0,
      messaggio: nuovoStato ? (
        <>
          Le voci <strong className="text-ink">Lista Trasferimenti</strong> e{' '}
          <strong className="text-ink">Ratifica Scambi</strong> compariranno nei menu, e i manager
          potranno mettere i propri giocatori in vetrina e trattare fra loro.
        </>
      ) : inSospeso > 0 ? (
        <>
          Ci sono <strong className="text-ink">{inSospeso} trattative aperte</strong>. Disattivando
          restano dove sono — non vengono cancellate — ma <strong className="text-ink">nessuno
          potrà più vederle</strong> finché non riattivi la funzione.
        </>
      ) : (
        <>
          Le pagine dei trasferimenti spariranno dai menu per tutti. Vetrine e trattative restano
          nel database e si ritrovano intatte alla riattivazione.
        </>
      ),
      testoConferma: nuovoStato ? 'Attiva' : 'Disattiva',
      esegui: async () => {
        const { error: rpcErr } = await supabase.rpc('admin_toggle_mercato', { p_stato: nuovoStato })
        if (rpcErr) setEsito({ tipo: 'errore', testo: rpcErr.message })
        else {
          setEsito({ tipo: 'ok', testo: `Trasferimenti ${nuovoStato ? 'attivati' : 'disattivati'}.` })
          await fetchProfili()
        }
      },
    })
  }

  // Sostituisce lo script fix_slots.js che veniva lanciato a mano da terminale.
  const handleRicalcolaSlot = async () => {
    setLoading(true)
    try {
      const r = await ricalcolaSlot()
      setEsito(r.error ? { tipo: 'errore', testo: r.error } : { tipo: 'ok', testo: r.success ?? 'Fatto.' })
    } catch (e) {
      setEsito({ tipo: 'errore', testo: 'Errore: ' + (e as Error).message })
    }
    setLoading(false)
  }

  const toggleRuolo = async (profiloId: string, ruoloCorrente: string) => {
    const nuovoRuolo = ruoloCorrente === 'ADMIN' ? 'MANAGER' : 'ADMIN'

    const { error: rpcErr } = await supabase.rpc('admin_set_ruolo', {
      p_target_user_id: profiloId,
      p_nuovo_ruolo: nuovoRuolo
    })

    if (rpcErr) {
      setEsito({ tipo: 'errore', testo: `Errore durante il cambio di ruolo: ${rpcErr.message}` })
    } else {
      await fetchProfili()
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="fm-title text-2xl sm:text-3xl">Impostazioni</h1>

      {esito && (
        <div className={`fm-alert ${esito.tipo === 'ok' ? 'fm-alert-ok' : 'fm-alert-danger'} flex items-start justify-between gap-3`}>
          <span className="font-semibold">{esito.testo}</span>
          <button onClick={() => setEsito(null)} aria-label="Chiudi avviso" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>1 · Caricamento dati</span>
        </div>
        <div className="fm-panel-body">
        <p className="mb-3 text-sm text-ink-mid">Carica i file nell&apos;ordine indicato: prima utenti e budget, poi il listone.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Uploader 
            title="Utenti & Budget" 
            description="Carica il file budget.xlsx (Colonne: nome utente, password, nome squadra, budget) per generare account Auth e Squadre." 
            action={importBudget} 
          />
          <Uploader
            title="Listone Giocatori & Rose"
            description="Carica il listone Mantra (#, Nome, Sq., Under, R., R.MANTRA, QUOT.). Le colonne FantaSquadra e Costo, se presenti, creano anche i tesseramenti delle rose già assegnate."
            avviso={
              <>
                <strong>⚠️ Azzera tutte le rose.</strong> Cancella i tesseramenti,
                riporta ogni giocatore a svincolato, e poi le ricostruisce{' '}
                <strong>solo</strong> da FantaSquadra e Costo di questo file. Quello
                che è stato vinto all&apos;asta o alle buste dopo che il file è stato
                esportato non c&apos;è dentro, e sparisce.
                <br />
                I crediti non vengono ricalcolati: restano quelli attuali.
              </>
            }
            action={importListone}
          />
          <Uploader
            title="Liste Aste a Chiamata"
            description="Carica il file aste (colonna id, poi una colonna per ogni utente con il nome della squadra che vuole quel giocatore). Sostituisce le liste esistenti."
            action={importAste}
          />
        </div>
        </div>
      </div>

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>2 · Gestione utenti</span>
          <span className="fm-label">{profili.length}</span>
        </div>
        {/* Mancava il wrapper di scroll: su schermo stretto la tabella
            veniva tagliata senza modo di raggiungere la colonna azioni. */}
        <div className="fm-table-scroll">
          <table className="fm-table">
            <thead>
              <tr>
                <th>Fantasquadra</th>
                <th>Ruolo attuale</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="py-8 text-center text-ink-dim">Caricamento in corso…</td></tr>
              ) : error ? (
                <tr><td colSpan={3} className="py-8 text-center font-semibold text-rosso">{error}</td></tr>
              ) : profili.map((p) => (
                <tr key={p.id}>
                  <td className="fm-nome">{p.squadre?.nome || 'Nessuna squadra'}</td>
                  <td>
                    <span className={`fm-chip ${p.ruolo === 'ADMIN' ? 'fm-chip-ambra' : 'fm-chip-neon'}`}>
                      {p.ruolo}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => toggleRuolo(p.id, p.ruolo)} className="fm-btn fm-btn-ghost fm-btn-sm">
                      Rendi {p.ruolo === 'ADMIN' ? 'manager' : 'admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>3 · Regole di lega</span>
        </div>
        <div className="fm-panel-body">
          <p className="mb-3 text-sm text-ink-mid">
            Numero massimo di portieri per squadra. Il limite viene applicato alla chiamata,
            alle offerte, al salvataggio delle buste e allo spoglio. Le squadre che sono già
            oltre soglia non vengono toccate: semplicemente non possono aggiungerne altri.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="max-portieri" className="fm-label mb-1 block">Massimo portieri</label>
              <input
                id="max-portieri"
                type="number"
                min="1"
                max="10"
                value={maxPortieri}
                onChange={(e) => setMaxPortieri(e.target.value)}
                className="fm-input w-24"
              />
            </div>
            <button onClick={salvaMaxPortieri} disabled={loading} className="fm-btn fm-btn-ghost">
              Salva
            </button>
          </div>

          <hr className="my-4 border-line" />

          <p className="mb-3 text-sm text-ink-mid">
            I secondi del contatore d&apos;asta. Il primo vale all&apos;avvio, perché tutti si
            accorgano che l&apos;asta è partita; il secondo dopo ogni rilancio, manuale o
            automatico, perché una battuta non si trascini.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="timer-primo" className="fm-label mb-1 block">Alla prima chiamata</label>
              <input
                id="timer-primo"
                type="number"
                min="3"
                max="600"
                value={timerPrimo}
                onChange={(e) => setTimerPrimo(e.target.value)}
                className="fm-input w-24"
              />
            </div>
            <div>
              <label htmlFor="timer-rilancio" className="fm-label mb-1 block">Dopo un rilancio</label>
              <input
                id="timer-rilancio"
                type="number"
                min="3"
                max="600"
                value={timerRilancio}
                onChange={(e) => setTimerRilancio(e.target.value)}
                className="fm-input w-24"
              />
            </div>
            <button onClick={salvaTimer} disabled={loading} className="fm-btn fm-btn-ghost">
              Salva
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-dim">
            I nuovi valori si applicano dalla chiamata successiva: un&apos;asta già avviata
            mantiene la scadenza che ha.
          </p>
        </div>
      </div>

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>4 · Funzioni attive</span>
          <span className={`fm-chip ${trasferimentiOn ? 'fm-chip-neon' : 'fm-chip-rosso'}`}>
            Trasferimenti {trasferimentiOn ? 'attivi' : 'spenti'}
          </span>
        </div>
        <div className="fm-panel-body">
          <p className="mb-3 text-sm text-ink-mid">
            Il mercato fra manager: vetrina dei giocatori in vendita, offerte di scambio e ratifica.
            Da spento le pagine <strong className="text-ink">spariscono dai menu</strong> per tutti,
            gli indirizzi diretti rimandano altrove e nella pagina <em>La mia Rosa</em> non compare
            nessun comando. Quello che è già stato inserito non viene cancellato.
          </p>
          <button onClick={toggleTrasferimenti} disabled={loading} className="fm-btn fm-btn-ghost">
            {trasferimentiOn ? 'Disattiva i trasferimenti' : 'Attiva i trasferimenti'}
          </button>
        </div>
      </div>

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>5 · Manutenzione</span>
        </div>
        <div className="fm-panel-body">
          <p className="mb-3 text-sm text-ink-mid">
            Riallinea il contatore <code className="rounded-sm bg-void px-1 text-ink">slot_occupati</code> di ogni squadra
            con il numero reale di giocatori tesserati.
          </p>
          <button onClick={handleRicalcolaSlot} disabled={loading} className="fm-btn fm-btn-ghost">
            Ricalcola slot occupati
          </button>
        </div>
      </div>

      <div className="fm-panel overflow-hidden border-rosso/40">
        <div className="fm-panel-head fm-panel-head--rosso">
          <span className="text-rosso">6 · Zona pericolosa (super admin)</span>
        </div>
        <div className="fm-panel-body">
          <p className="mb-3 text-sm text-ink-mid">
            Cancella <strong className="text-ink">tutti i giocatori, le aste, le squadre e disconnette gli utenti attuali</strong> (tranne
            il tuo profilo super admin). Da usare solo a fine stagione, per preparare il sito al fantacalcio successivo.
          </p>
          <button onClick={() => setShowConfirmModal(true)} className="fm-btn fm-btn-danger">
            ⚠️ Hard reset lega
          </button>
        </div>
      </div>

      <Conferma
        aperta={azione !== null}
        titolo={azione?.titolo ?? ''}
        messaggio={azione?.messaggio ?? ''}
        testoConferma={azione?.testoConferma ?? 'Conferma'}
        tono={azione?.pericolo ? 'pericolo' : 'neutro'}
        onAnnulla={() => setAzione(null)}
        onConferma={async () => {
          const inCorso = azione
          setAzione(null)
          setEsito(null)
          await inCorso?.esegui()
        }}
      />

      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
          onClick={() => { setShowConfirmModal(false); setConfirmText('') }}
          role="presentation"
        >
          <div
            className="fm-panel w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-titolo"
          >
            <div className="fm-panel-head fm-panel-head--rosso">
              <span id="reset-titolo" className="text-rosso">Sei sicuro?</span>
            </div>
            <div className="fm-panel-body">
              <p className="mb-3 text-sm text-ink-mid">
                Stai per cancellare irrimediabilmente tutto il database. Per confermare, scrivi{' '}
                <strong className="text-ink">CONFERMO</strong> qui sotto.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="fm-input mb-5"
                placeholder="Scrivi CONFERMO"
                aria-label="Digita CONFERMO per abilitare il reset"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowConfirmModal(false); setConfirmText('') }}
                  className="fm-btn fm-btn-ghost flex-1"
                >
                  Annulla
                </button>
                <button
                  onClick={handleHardReset}
                  disabled={confirmText !== 'CONFERMO' || loading}
                  className="fm-btn fm-btn-danger flex-1"
                >
                  Esegui reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
