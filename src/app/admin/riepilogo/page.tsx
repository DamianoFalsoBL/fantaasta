'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import Conferma from '@/components/Conferma'

function BudgetAdjuster({ onApply }: { onApply: (delta: number) => void }) {
  const [amount, setAmount] = useState<number>(5)

  return (
    <div className="mx-auto flex w-max items-center gap-1.5 rounded-md border border-line bg-void p-1">
      <button
        onClick={() => onApply(-amount)}
        title={`Rimuovi ${amount} crediti`}
        aria-label={`Rimuovi ${amount} crediti`}
        className="flex h-7 w-7 items-center justify-center rounded-sm border border-rosso/40 bg-rosso/10 font-bold text-rosso transition hover:bg-rosso/20"
      >
        −
      </button>
      <input
        type="number"
        min="1"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value) || 0)}
        aria-label="Crediti da aggiungere o togliere"
        className="fm-input h-7 w-14 min-h-0 px-1 py-0 text-center text-sm"
      />
      <button
        onClick={() => onApply(amount)}
        title={`Aggiungi ${amount} crediti`}
        aria-label={`Aggiungi ${amount} crediti`}
        className="flex h-7 w-7 items-center justify-center rounded-sm border border-neon/40 bg-neon/10 font-bold text-neon transition hover:bg-neon/20"
      >
        +
      </button>
    </div>
  )
}

// Al posto di `confirm()`: si registra qui l'azione in attesa di conferma.
type AzioneInAttesa = {
  titolo: string
  messaggio: React.ReactNode
  testoConferma: string
  pericolo?: boolean
  esegui: () => Promise<void>
}

export default function AdminRiepilogoPage() {
  const supabase = createClient()
  const [squadre, setSquadre] = useState<any[]>([])
  const [acquisti, setAcquisti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [faseBusteAperta, setFaseBusteAperta] = useState(false)
  const [mercatoAperto, setMercatoAperto] = useState(false)
  const [azione, setAzione] = useState<AzioneInAttesa | null>(null)
  // Al posto di `alert()`: un avviso in pagina, che il tema può raggiungere.
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    
    // Fetch Squadre
    const { data: sData } = await supabase
      .from('squadre')
      .select('*')
      .order('nome')
    if (sData) setSquadre(sData)

    // Fetch Ultimi Acquisti (Aste Chiuse)
    const { data: aData } = await supabase
      .from('aste')
      .select('*, squadre!squadra_in_testa(nome), giocatori(nome, ruolo)')
      .eq('stato', 'CHIUSA')
      .not('squadra_in_testa', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)
    if (aData) setAcquisti(aData)

    // Fetch regole_lega
    const { data: rData } = await supabase
      .from('regole_lega').select('fase_buste_aperta, fase_mercato_aperta').limit(1).maybeSingle()
    // La colonna ammette NULL: qui vale "fase chiusa", come il default.
    if (rData) {
      setFaseBusteAperta(rData.fase_buste_aperta ?? false)
      setMercatoAperto(rData.fase_mercato_aperta ?? false)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const modificaBudget = (squadraId: string, delta: number) => {
    const squadra = squadre.find((s) => s.id === squadraId)
    setAzione({
      titolo: delta > 0 ? 'Aggiungere crediti' : 'Togliere crediti',
      messaggio: (
        <>
          Vuoi {delta > 0 ? 'aggiungere' : 'togliere'} <strong className="text-ink">{Math.abs(delta)} crediti</strong>
          {squadra ? <> a <strong className="text-ink">{squadra.nome}</strong></> : null}?
        </>
      ),
      testoConferma: delta > 0 ? 'Aggiungi' : 'Togli',
      esegui: async () => {
        const { error } = await supabase.rpc('admin_modifica_budget', { p_squadra_id: squadraId, p_delta: delta })
        if (error) setEsito({ tipo: 'errore', testo: `Errore modifica budget: ${error.message}` })
        else { setEsito({ tipo: 'ok', testo: 'Budget aggiornato.' }); await fetchData() }
      },
    })
  }

  const annullaAcquisto = (astaId: string, giocatoreNome: string, squadraNome: string) => {
    setAzione({
      titolo: 'Annullare l\'acquisto',
      pericolo: true,
      messaggio: (
        <>
          Stai per annullare l&apos;acquisto di <strong className="text-ink">{giocatoreNome}</strong> da parte di{' '}
          <strong className="text-ink">{squadraNome}</strong>. I crediti verranno rimborsati e il giocatore tornerà
          disponibile per una nuova asta. L&apos;operazione non si può annullare.
        </>
      ),
      testoConferma: 'Annulla acquisto',
      esegui: async () => {
        const { error } = await supabase.rpc('admin_annulla_acquisto', { p_asta_id: astaId })
        if (error) setEsito({ tipo: 'errore', testo: `Errore annullamento acquisto: ${error.message}` })
        else { setEsito({ tipo: 'ok', testo: `Acquisto di ${giocatoreNome} annullato.` }); await fetchData() }
      },
    })
  }

  const toggleBuste = () => {
    const nuovoStato = !faseBusteAperta
    setAzione({
      titolo: nuovoStato ? 'Aprire la fase buste' : 'Chiudere la fase buste',
      messaggio: nuovoStato
        ? 'I manager potranno inserire le loro liste. Se il turno precedente ha già prodotto esiti, si apre un turno nuovo.'
        : 'I manager non potranno più modificare le liste. Serve chiudere prima di procedere allo spoglio.',
      testoConferma: nuovoStato ? 'Apri' : 'Chiudi',
      esegui: async () => {
        const { error } = await supabase.rpc('admin_toggle_buste', { p_stato: nuovoStato })
        if (error) setEsito({ tipo: 'errore', testo: `Errore: ${error.message}` })
        else { setEsito({ tipo: 'ok', testo: `Fase buste ${nuovoStato ? 'aperta' : 'chiusa'}.` }); await fetchData() }
      },
    })
  }

  const toggleMercato = () => {
    const nuovoStato = !mercatoAperto
    setAzione({
      titolo: nuovoStato ? 'Aprire il mercato trasferimenti' : 'Chiudere il mercato trasferimenti',
      messaggio: nuovoStato
        ? 'I manager potranno mettere i propri giocatori in lista trasferimenti e trattare fra loro. Gli scambi restano comunque da ratificare qui.'
        : 'Le trattative in corso restano dove sono, ma nessuno potrà più farne di nuove né accettarle, e nessuno scambio potrà essere eseguito.',
      testoConferma: nuovoStato ? 'Apri' : 'Chiudi',
      esegui: async () => {
        const { error } = await supabase.rpc('admin_toggle_mercato', { p_stato: nuovoStato })
        if (error) setEsito({ tipo: 'errore', testo: `Errore: ${error.message}` })
        else { setEsito({ tipo: 'ok', testo: `Mercato ${nuovoStato ? 'aperto' : 'chiuso'}.` }); await fetchData() }
      },
    })
  }

  const elaboraBuste = () => {
    if (faseBusteAperta) {
      setEsito({ tipo: 'errore', testo: 'Devi prima chiudere la fase buste per poter effettuare lo spoglio.' })
      return
    }
    setAzione({
      titolo: 'Spoglio delle buste',
      pericolo: true,
      messaggio: 'I giocatori richiesti da una sola squadra vengono tesserati subito; quelli richiesti da più squadre vanno allo spareggio live.',
      testoConferma: 'Procedi allo spoglio',
      esegui: async () => {
        const { error } = await supabase.rpc('admin_elabora_buste')
        if (error) setEsito({ tipo: 'errore', testo: `Errore durante lo spoglio: ${error.message}` })
        else { setEsito({ tipo: 'ok', testo: 'Spoglio completato.' }); await fetchData() }
      },
    })
  }

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">Riepilogo lega e budget</h1>
          <Link href="/admin/asta" className="fm-btn fm-btn-ghost">
            Vai alla regia asta
          </Link>
        </div>

        {esito && (
          <div className={`fm-alert ${esito.tipo === 'ok' ? 'fm-alert-ok' : 'fm-alert-danger'} flex items-start justify-between gap-3`}>
            <span className="font-semibold">{esito.testo}</span>
            <button onClick={() => setEsito(null)} aria-label="Chiudi avviso" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* CONTROLLI BUSTE */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Fase buste / riparazione</span>
            <span className={`fm-chip ${faseBusteAperta ? 'fm-chip-neon' : 'fm-chip-rosso'}`}>
              {faseBusteAperta ? 'Aperta' : 'Chiusa'}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-mid">Gestisci l&apos;apertura del mercato e lo spoglio delle selezioni.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleBuste} className="fm-btn fm-btn-ghost">
                {faseBusteAperta ? 'Chiudi fase buste' : 'Apri fase buste'}
              </button>
              <button onClick={elaboraBuste} className="fm-btn fm-btn-primary">
                Elabora buste (spoglio)
              </button>
            </div>
          </div>
        </div>

        {/* CONTROLLI MERCATO TRASFERIMENTI */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Mercato trasferimenti</span>
            <span className={`fm-chip ${mercatoAperto ? 'fm-chip-neon' : 'fm-chip-rosso'}`}>
              {mercatoAperto ? 'Aperto' : 'Chiuso'}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-mid">
              Scambi fra manager. Il mercato precede le aste: tienilo chiuso mentre si gioca.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleMercato} className="fm-btn fm-btn-ghost">
                {mercatoAperto ? 'Chiudi il mercato' : 'Apri il mercato'}
              </button>
              <Link href="/admin/trasferimenti" className="fm-btn fm-btn-primary">
                Scambi da ratificare
              </Link>
            </div>
          </div>
        </div>

        {/* TABELLA SQUADRE */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--neon">
            <span>Stato squadre</span>
            <span className="fm-label">{squadre.length}</span>
          </div>
          {/* Scroll orizzontale con prima colonna fissa: la cella del
              regolatore crediti è larga e non si può comprimere. */}
          <div className="fm-table-scroll">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Fantasquadra</th>
                  <th className="fm-num">Budget iniziale</th>
                  <th className="fm-num">Budget residuo</th>
                  <th className="text-center">Aggiungi / togli crediti</th>
                  <th className="fm-num">Slot</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-ink-dim">Caricamento in corso…</td></tr>
                ) : squadre.map(s => (
                  <tr key={s.id}>
                    <td className="fm-nome">{s.nome}</td>
                    <td className="fm-num text-ink-mid">{s.budget_iniziale}</td>
                    <td className="fm-num">
                      <span className="text-lg font-bold text-neon">{s.crediti_residui}</span>
                    </td>
                    <td className="text-center">
                      <BudgetAdjuster onApply={(delta) => modificaBudget(s.id, delta)} />
                    </td>
                    <td className="fm-num text-ink-mid">{s.slot_occupati}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* EXPORT FINALE */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Export finale rose</span>
          </div>
          <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-mid">
              File di testo con tre colonne: <code className="rounded-sm bg-void px-1 text-ink">id calciatore</code>,{' '}
              <code className="rounded-sm bg-void px-1 text-ink">nome fantasquadra</code>,{' '}
              <code className="rounded-sm bg-void px-1 text-ink">costo</code>. L&apos;id è quello del listone.
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <a href="/api/export/rose" className="fm-btn fm-btn-primary">
                Scarica CSV
              </a>
              <a
                href="/api/export/rose?intestazione=no"
                className="text-sm font-medium text-ink-dim underline underline-offset-2 hover:text-ink"
              >
                senza intestazione
              </a>
            </div>
          </div>
        </div>

        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--rosso">
            <span>Ultimi 20 acquisti · annullamento</span>
          </div>
          <div className="fm-table-scroll">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Calciatore</th>
                  <th>Fantasquadra</th>
                  <th className="fm-num">Prezzo</th>
                  <th className="text-center">Azione admin</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-ink-dim">Caricamento in corso…</td></tr>
                ) : acquisti.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-ink-dim">Nessun acquisto recente.</td></tr>
                ) : acquisti.map(a => (
                  <tr key={a.id}>
                    <td className="fm-nome">{a.giocatori?.nome}</td>
                    <td className="font-semibold text-viola-hi">{a.squadre?.nome}</td>
                    <td className="fm-num">
                      <span className="fm-badge fm-badge-top">{a.prezzo_corrente}</span>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => annullaAcquisto(a.id, a.giocatori?.nome, a.squadre?.nome)}
                        className="fm-btn fm-btn-danger fm-btn-sm"
                      >
                        Annulla acquisto
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  )
}
