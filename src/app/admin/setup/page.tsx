'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { importBudget, importListone, importAste, ricalcolaSlot, type RisultatoImport } from '../actions'

function Uploader({ title, description, action }: { title: string, description: string, action: (formData: FormData) => Promise<RisultatoImport> }) {
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
    <div className="fm-panel p-4">
      <h3 className="fm-title text-base">{title}</h3>
      <p className="mb-3 mt-1 text-sm text-ink-mid">{description}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
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

  // L'accesso è già garantito dal gate server-side in setup/layout.tsx:
  // qui non serve più ricontrollare il ruolo lato client.
  const fetchProfili = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profili')
      .select('id, ruolo, squadra_id, squadre(nome)')
      .neq('ruolo', 'SUPER_ADMIN')
      .order('squadra_id')

    if (error) setError(error.message)
    else setProfili((data as unknown as ProfiloRiga[]) || [])
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
    <div className="mx-auto max-w-4xl space-y-4 px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="fm-title text-2xl sm:text-3xl">⚙️ Impostazioni sistema</h1>

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
          <span>3 · Manutenzione</span>
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
          <span className="text-rosso">4 · Zona pericolosa (super admin)</span>
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
