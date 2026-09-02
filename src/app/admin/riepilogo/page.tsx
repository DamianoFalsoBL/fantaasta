'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import Conferma from '@/components/Conferma'
import { resetPasswordSquadra } from '../actions'
import { ascoltaPresenza } from '@/utils/presenza'

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

/**
 * Le credenziali appena generate, con il pulsante per copiarle.
 *
 * E' un componente e non un pezzo di JSX dentro il messaggio della finestra
 * perche' il pulsante ha uno stato suo (il "Copiato" che compare per un
 * attimo), e i messaggi di `Conferma` sono nodi statici.
 */
function CredenzialiGenerate({ squadra, email, password }: { squadra: string; email: string; password: string }) {
  const [statoCopia, setStatoCopia] = useState<'pronto' | 'copiato' | 'negato'>('pronto')

  const copia = async () => {
    try {
      // Solo la password, non anche l'utente: chi la riceve deve poterla
      // incollare direttamente nel campo, e le due righe di contorno
      // andrebbero cancellate a mano ogni volta. L'utente resta scritto qui
      // sopra per chi non se lo ricorda.
      await navigator.clipboard.writeText(password)
      setStatoCopia('copiato')
      setTimeout(() => setStatoCopia('pronto'), 2000)
    } catch {
      // Il browser puo' negare gli appunti — succede fuori da HTTPS e in certi
      // contesti incorniciati. Va detto: un pulsante che non fa niente e non
      // si lamenta fa incollare il vuoto convinti di avere la password.
      setStatoCopia('negato')
    }
  }

  return (
    <div className="space-y-3">
      <p>
        Password nuova per <strong className="text-ink">{squadra}</strong>. Copiala adesso:{' '}
        <strong className="text-ink">non si potrà più rileggere</strong>.
      </p>
      <div className="space-y-1 rounded-md border border-line bg-void p-3">
        <div className="fm-label">Utente</div>
        <div className="break-all font-mono text-sm text-ink">{email}</div>
        <div className="fm-label pt-2">Password</div>
        <div className="font-mono text-xl font-bold tracking-wider text-neon">{password}</div>
      </div>
      <button onClick={copia} className="fm-btn fm-btn-ghost fm-btn-sm">
        {statoCopia === 'copiato' ? 'Copiata' : 'Copia la password'}
      </button>
      {statoCopia === 'negato' && (
        <p className="text-xs text-rosso">
          Il browser non ha concesso gli appunti: seleziona e copia la password a mano.
        </p>
      )}
    </div>
  )
}

/**
 * Se una squadra ha consegnato la busta per il turno in corso.
 *
 * **E' un si' o un no, non una frazione.** `submit_buste` pretende esattamente
 * tanti giocatori quanti sono gli slot liberi e riscrive tutto in un colpo:
 * quel conteggio puo' valere solo zero o il totale, mai una via di mezzo. La
 * prima versione mostrava "0 / 4", che ripeteva il denominatore gia' scritto
 * nella colonna Slot e faceva credere possibile un salvataggio parziale.
 *
 * Resta un ramo per il numero strano: se un giorno comparisse un valore
 * intermedio — una riga scritta a mano, una funzione cambiata — si vede invece
 * di sparire dietro una crocetta.
 */
/**
 * Il pallino di «collegato adesso».
 *
 * Verde pieno quando c'e', cerchio vuoto quando non c'e': **la forma cambia
 * insieme al colore**, cosi' si distingue anche senza percepire il verde.
 *
 * Dice «ha il sito aperto», non «lo sta guardando»: una scheda dimenticata
 * aperta risulta collegata. Il titolo lo scrive per esteso invece di lasciarlo
 * intendere.
 *
 * Niente «collegata da N minuti»: per calcolarlo servirebbe leggere l'orologio
 * durante il disegno, e quel numero resterebbe poi fermo finche' qualcos'altro
 * non fa ridisegnare la riga. Un dettaglio che nessuno usa non vale un dato
 * che mente.
 */
function Collegata({ collegata }: { collegata: boolean }) {
  return (
    <span
      title={collegata
        ? 'Collegata: ha il sito aperto, il che non vuol dire che lo stia guardando'
        : 'Non collegata'}
      aria-label={collegata ? 'Collegata' : 'Non collegata'}
      className={`mr-2 inline-block h-2 w-2 shrink-0 rounded-full align-middle ${
        collegata ? 'bg-neon' : 'border border-line-hi'
      }`}
    />
  )
}

function StatoBuste({ aperta, consegnate, slotLiberi }: { aperta: boolean; consegnate: number; slotLiberi: number }) {
  if (!aperta) return <span className="text-ink-dim">—</span>
  if (slotLiberi <= 0) return <span className="fm-label">rosa piena</span>
  if (consegnate === slotLiberi) {
    return <span className="text-lg font-bold text-neon" title={`Consegnata: ${consegnate} giocatori`}>✓</span>
  }
  if (consegnate === 0) {
    return <span className="text-lg font-bold text-rosso" title="Non ancora consegnata">✗</span>
  }
  return (
    <span className="fm-badge fm-badge-mid" title="Numero inatteso: una busta e' completa o non c'e'">
      {consegnate} / {slotLiberi}
    </span>
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
  /** Squadra -> da quando e' collegata. Vuota finche' non arriva il primo sync. */
  const [collegati, setCollegati] = useState<Map<string, number>>(new Map())
  // Serve a mostrare gli slot come "24 / 30". Il solo numero degli occupati
  // non dice se una rosa e' completa, ed era l'unica ragione per cui esisteva
  // la pagina /debug, ora assorbita qui.
  const [slotTotali, setSlotTotali] = useState(30)
  const [azione, setAzione] = useState<AzioneInAttesa | null>(null)

  // Chi e' collegato adesso. Il canale lo tiene la NavBar (unico componente su
  // ogni pagina): qui ci si limita ad ascoltarlo, perche' due canali sullo
  // stesso topic dallo stesso browser non esistono - `channel()` restituisce
  // sempre lo stesso oggetto e rifiuta ascoltatori dopo `subscribe()`.
  useEffect(() => ascoltaPresenza(setCollegati), [])
  // Al posto di `alert()`: un avviso in pagina, che il tema può raggiungere.
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)
  // La password appena generata. Vive solo qui, finche' la finestra resta
  // aperta: non viene salvata da nessuna parte e non si puo' rileggere.
  const [credenziali, setCredenziali] = useState<{ squadra: string; email: string; password: string } | null>(null)
  /**
   * Quante buste ha gia' consegnato ogni squadra nel turno in corso.
   *
   * Serve a sapere chi manca senza chiederlo a voce: all'asta del 27 agosto si
   * e' aspettato senza sapere se il ritardatario stesse compilando o si fosse
   * distratto.
   *
   * L'admin puo' leggerle: `lettura_buste` glielo concede perche' gli serve per
   * lo spoglio. Qui pero' si mostra **solo il conteggio**, mai quali giocatori:
   * in questa lega l'amministratore gioca, e sapere i nomi altrui prima dello
   * spoglio sarebbe un vantaggio.
   */
  const [busteConsegnate, setBusteConsegnate] = useState<Map<string, number>>(new Map())

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
      .from('regole_lega').select('fase_buste_aperta, slot_totali, turno_buste').limit(1).maybeSingle()
    // La colonna ammette NULL: qui vale "fase chiusa", come il default.
    if (rData) {
      setFaseBusteAperta(rData.fase_buste_aperta ?? false)
      setSlotTotali(rData.slot_totali ?? 30)
    }

    await contaBuste(rData?.turno_buste ?? 1)

    setLoading(false)
  }

  /**
   * Il conteggio delle buste in attesa, turno per turno.
   *
   * Sta in una funzione sua perche' e' l'unica cosa che cambia mentre la fase
   * e' aperta, e va riletta da sola invece di ricaricare tutta la pagina.
   */
  const contaBuste = async (turno: number) => {
    const { data } = await supabase
      .from('buste')
      .select('squadra_id')
      .eq('esito', 'ATTESA')
      .eq('turno', turno)

    const conto = new Map<string, number>()
    for (const b of data ?? []) {
      conto.set(b.squadra_id, (conto.get(b.squadra_id) ?? 0) + 1)
    }
    setBusteConsegnate(conto)
  }

  useEffect(() => {
    fetchData()
  }, [])

  /**
   * Mentre la fase e' aperta il conteggio si aggiorna da solo.
   *
   * Senza, la colonna direbbe come stavano le cose all'apertura della pagina, e
   * una spunta verde ferma e' peggio di nessuna spunta: si chiude la fase
   * credendo che abbiano consegnato tutti.
   *
   * Venti secondi, una query sola, e **solo a fase aperta**: a fase chiusa non
   * c'e' niente che possa cambiare.
   */
  useEffect(() => {
    if (!faseBusteAperta) return
    const t = setInterval(() => { void ricontaBuste() }, 20000)
    return () => clearInterval(t)
  }, [faseBusteAperta])

  const ricontaBuste = async () => {
    const { data } = await supabase
      .from('regole_lega').select('turno_buste').limit(1).maybeSingle()
    await contaBuste(data?.turno_buste ?? 1)
  }

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

  const resetPassword = (squadraId: string, squadraNome: string) => {
    setAzione({
      titolo: 'Nuova password',
      pericolo: true,
      messaggio: (
        <>
          Stai per generare una password nuova per <strong className="text-ink">{squadraNome}</strong>. Quella
          attuale smette di funzionare subito, anche se il manager se l&apos;era cambiata da sé. La password
          nuova viene mostrata <strong className="text-ink">una volta sola</strong>: se chiudi la finestra senza
          copiarla, si rifà il reset.
        </>
      ),
      testoConferma: 'Genera',
      esegui: async () => {
        const esitoReset = await resetPasswordSquadra(squadraId)
        if ('error' in esitoReset) setEsito({ tipo: 'errore', testo: esitoReset.error })
        else setCredenziali(esitoReset)
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
    <div>
      <div className="fm-pagina space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">Budget e fasi</h1>
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

        {/* I trasferimenti non stanno più qui: sono una funzione, non una fase,
            e si accendono da Impostazioni. Questa pagina governa le fasi del
            gioco e i budget. */}

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
                  <th className="text-center">Slot</th>
                  <th className="text-center">Buste</th>
                  <th className="text-center">Accesso</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-ink-dim">Caricamento in corso…</td></tr>
                ) : squadre.map(s => (
                  <tr key={s.id}>
                    <td className="fm-nome">
                      <Collegata collegata={collegati.has(s.id)} />
                      {s.nome}
                    </td>
                    <td className="fm-num text-ink-mid">{s.budget_iniziale}</td>
                    <td className="fm-num">
                      <span className="text-lg font-bold text-neon">{s.crediti_residui}</span>
                    </td>
                    <td className="text-center">
                      <BudgetAdjuster onApply={(delta) => modificaBudget(s.id, delta)} />
                    </td>
                    <td className="text-center">
                      <span className={`fm-badge ${(s.slot_occupati ?? 0) < slotTotali ? 'fm-badge-mid' : 'fm-badge-top'}`}>
                        {s.slot_occupati ?? 0} / {slotTotali}
                      </span>
                    </td>
                    <td className="text-center">
                      <StatoBuste
                        aperta={faseBusteAperta}
                        consegnate={busteConsegnate.get(s.id) ?? 0}
                        slotLiberi={slotTotali - (s.slot_occupati ?? 0)}
                      />
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => resetPassword(s.id, s.nome)}
                        className="fm-btn fm-btn-ghost fm-btn-sm"
                      >
                        Nuova password
                      </button>
                    </td>
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
              Nel formato che <strong>fantacalcio.it</strong> accetta in import: colonne{' '}
              <code className="rounded-sm bg-void px-1 text-ink">fantasquadra</code>,{' '}
              <code className="rounded-sm bg-void px-1 text-ink">id calciatore</code>,{' '}
              <code className="rounded-sm bg-void px-1 text-ink">costo</code>, con una riga{' '}
              <code className="rounded-sm bg-void px-1 text-ink">$,$,$</code> a separare le rose.
              L&apos;id è quello del listone.
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <a href="/api/export/rose" className="fm-btn fm-btn-primary">
                Scarica CSV
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
        aperta={credenziali !== null}
        titolo="Password generata"
        soloConferma
        messaggio={credenziali ? <CredenzialiGenerate {...credenziali} /> : ''}
        testoConferma="Ho copiato, chiudi"
        onAnnulla={() => setCredenziali(null)}
        onConferma={() => setCredenziali(null)}
      />

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
