'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import MantraBadge from '@/components/MantraBadge'
import {
  badgeRuolo,
  ORDINE_RUOLI,
  valoreContropartita,
  type GiocatoreMercato,
} from '@/utils/trasferimenti'

/**
 * Costruttore di un'offerta di scambio.
 *
 * La struttura a due colonne è quella già collaudata sulle buste
 * (`src/app/buste/page.tsx`), e ne eredita anche le lezioni pagate lì: griglia
 * e non flex, `min-w-0` sulle colonne perché un nome lungo non restringa
 * l'altra, e riepilogo `order-first` sotto `lg` così che su telefono il
 * pulsante di invio non finisca in fondo a un elenco di trenta giocatori.
 */
export default function OffertaTrasferimento({
  giocatore,
  proprietario,
  onChiudi,
  onInviata,
}: {
  giocatore: GiocatoreMercato
  proprietario: { id: string; nome: string }
  onChiudi: () => void
  onInviata: () => void
}) {
  const supabase = createClient()

  const [rosa, setRosa] = useState<GiocatoreMercato[]>([])
  const [crediti, setCrediti] = useState<number>(0)
  const [creditiResidui, setCreditiResidui] = useState<number>(0)
  const [scelti, setScelti] = useState<GiocatoreMercato[]>([])
  const [messaggio, setMessaggio] = useState('')
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  const carica = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: prof } = await supabase
      .from('profili').select('squadra_id').eq('id', userData.user.id).maybeSingle()
    if (!prof?.squadra_id) { setLoading(false); return }

    const { data: sq } = await supabase
      .from('squadre').select('crediti_residui').eq('id', prof.squadra_id).maybeSingle()
    setCreditiResidui(sq?.crediti_residui ?? 0)

    const { data: righe, error } = await supabase
      .from('tesseramenti')
      .select('giocatori(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra)')
      .eq('squadra_id', prof.squadra_id)
    if (error) { setErrore(`Impossibile leggere la tua rosa: ${error.message}`); setLoading(false); return }

    const lista = (righe ?? [])
      .map((r) => r.giocatori as unknown as GiocatoreMercato | null)
      .filter((g): g is GiocatoreMercato => g !== null)
      .sort((a, b) =>
        (ORDINE_RUOLI[a.ruolo] ?? 99) - (ORDINE_RUOLI[b.ruolo] ?? 99) || a.nome.localeCompare(b.nome))

    setRosa(lista)
    setLoading(false)
  }, [supabase])

  useEffect(() => { void carica() }, [carica])

  // Esc chiude, come nella modale di conferma.
  useEffect(() => {
    const chiudi = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('keydown', chiudi)
    return () => document.removeEventListener('keydown', chiudi)
  }, [onChiudi])

  const alterna = (g: GiocatoreMercato) => {
    setScelti((s) => (s.some((x) => x.id === g.id) ? s.filter((x) => x.id !== g.id) : [...s, g]))
  }

  const valore = useMemo(() => valoreContropartita(crediti, scelti), [crediti, scelti])
  const creditiEccessivi = crediti > creditiResidui
  const vuota = crediti <= 0 && scelti.length === 0
  const inviabile = !vuota && !creditiEccessivi && !invio && crediti >= 0

  const invia = async () => {
    setInvio(true)
    setErrore(null)
    const { error } = await supabase.rpc('crea_offerta_trasferimento', {
      p_giocatore_id: giocatore.id,
      p_crediti: crediti,
      p_giocatori_offerti: scelti.map((g) => g.id),
      // Omesso e non `null`, come per p_prezzo: il default in SQL è già NULL.
      p_messaggio: messaggio.trim() === '' ? undefined : messaggio.trim(),
    })
    setInvio(false)
    if (error) { setErrore(error.message); return }
    onInviata()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/80 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onChiudi}
      role="presentation"
    >
      <div
        className="fm-panel my-auto w-full max-w-4xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offerta-titolo"
      >
        <div className="fm-panel-head fm-panel-head--neon">
          <span id="offerta-titolo" className="truncate">Offerta per {giocatore.nome}</span>
          <button onClick={onChiudi} aria-label="Chiudi" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>

        <div className="fm-panel-body">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel-hi p-2.5">
            <span className={`fm-badge ${badgeRuolo(giocatore.ruolo)}`}>{giocatore.ruolo}</span>
            <span className="fm-nome">{giocatore.nome}</span>
            {giocatore.ruolo_mantra && giocatore.ruolo_mantra.length > 0 && (
              <MantraBadge ruoli={giocatore.ruolo_mantra} />
            )}
            <span className="fm-label">
              {giocatore.squadra}{giocatore.eta ? ` · ${giocatore.eta}` : ''} · quotazione {giocatore.quotazione}
            </span>
            <span className="fm-chip fm-chip-attivo ml-auto">di {proprietario.nome}</span>
          </div>

          {errore && (
            <div className="fm-alert fm-alert-danger mb-3 font-semibold">{errore}</div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">

            {/* Cosa metto sul piatto */}
            <div className="min-w-0 lg:col-span-2">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="fm-label">Calciatori che offri</span>
                <span className="fm-label">{scelti.length} scelti</span>
              </div>
              <div className="h-[38svh] space-y-1.5 overflow-y-auto pr-1 md:h-[340px]">
                {loading && <div className="p-6 text-center text-sm text-ink-dim">Caricamento…</div>}
                {!loading && rosa.length === 0 && (
                  <div className="p-6 text-center text-sm text-ink-dim">La tua rosa è vuota.</div>
                )}
                {rosa.map((g) => {
                  const selezionato = scelti.some((x) => x.id === g.id)
                  return (
                    <div
                      key={g.id}
                      onClick={() => alterna(g)}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2 transition ${
                        selezionato
                          ? 'border-neon bg-panel-hover'
                          : 'border-line bg-panel-hi hover:border-line-hi hover:bg-panel-hover'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`fm-badge shrink-0 ${badgeRuolo(g.ruolo)}`}>{g.ruolo}</span>
                        <div className="min-w-0">
                          <div className="fm-nome truncate">{g.nome}</div>
                          <div className="fm-label truncate">{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</div>
                        </div>
                      </div>
                      <span className={`fm-badge shrink-0 ${selezionato ? 'fm-badge-top' : 'fm-badge-good'}`}>
                        {g.quotazione}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Riepilogo. `order-first` sotto lg: impilato finirebbe in fondo
                a tutta la rosa, e il pulsante di invio sarebbe irraggiungibile. */}
            <div className="order-first min-w-0 space-y-3 lg:order-none">
              <div>
                <label htmlFor="offerta-crediti" className="fm-label mb-1 block">Crediti offerti</label>
                <input
                  id="offerta-crediti"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="fm-input w-full"
                  value={crediti === 0 ? '' : crediti}
                  placeholder="0"
                  onChange={(e) => setCrediti(Math.max(0, Number(e.target.value) || 0))}
                />
                <p className={`mt-1 text-xs ${creditiEccessivi ? 'font-semibold text-rosso' : 'text-ink-dim'}`}>
                  {creditiEccessivi
                    ? `Hai solo ${creditiResidui} crediti.`
                    : `Disponibili ${creditiResidui} cr`}
                </p>
              </div>

              <div className="rounded-md border border-line bg-panel-hi p-3">
                <div className="flex items-center justify-between">
                  <span className="fm-label">Valore contropartita</span>
                  <span className="text-xl font-bold tabular-nums text-neon">{valore} cr</span>
                </div>
                {/* La formula in chiaro: è la regola che deciderà quanto
                    risulterà costato il giocatore, e va vista adesso. */}
                <p className="mt-1.5 text-xs text-ink-dim">
                  {crediti} cr
                  {scelti.length > 0 && ` + ${scelti.map((g) => g.quotazione).join(' + ')} di quotazione`}
                  {' '}· è quanto risulterà costato {giocatore.nome}.
                </p>
              </div>

              <div>
                <label htmlFor="offerta-messaggio" className="fm-label mb-1 block">Messaggio (facoltativo)</label>
                <textarea
                  id="offerta-messaggio"
                  rows={2}
                  className="fm-input w-full"
                  value={messaggio}
                  onChange={(e) => setMessaggio(e.target.value)}
                />
              </div>

              <button onClick={invia} disabled={!inviabile} className="fm-btn fm-btn-primary w-full">
                {invio ? 'Invio…' : 'Invia offerta'}
              </button>
              {vuota && (
                <p className="text-center text-xs font-semibold text-rosso">
                  Metti almeno dei crediti o un calciatore.
                </p>
              )}
              <button onClick={onChiudi} className="fm-btn fm-btn-ghost w-full">Annulla</button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
