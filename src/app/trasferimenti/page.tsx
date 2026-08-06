'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import MantraBadge from '@/components/MantraBadge'
import Conferma from '@/components/Conferma'
import OffertaTrasferimento from '@/components/OffertaTrasferimento'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import { mantraPresenti, ruoloCorrisponde } from '@/utils/ruoli'
import {
  badgeRuolo,
  ETICHETTA_STATO,
  ORDINE_RUOLI,
  type GiocatoreMercato,
  type StatoOfferta,
} from '@/utils/trasferimenti'

type VoceVetrina = {
  giocatore: GiocatoreMercato
  proprietario: { id: string; nome: string }
  in_vendita: boolean
  prezzo_richiesto: number | null
}

type Offerta = {
  id: string
  stato: StatoOfferta
  crediti: number
  messaggio: string | null
  created_at: string
  squadra_da: string
  squadra_a: string
  richiesto: GiocatoreMercato | null
  da: { id: string; nome: string } | null
  a: { id: string; nome: string } | null
  ceduti: GiocatoreMercato[]
}

type AzioneInAttesa = {
  titolo: string
  messaggio: React.ReactNode
  testoConferma: string
  pericolo?: boolean
  esegui: () => Promise<void>
}

// `giocatori` va disambiguato: dalla tabella delle offerte si arriva ai
// giocatori sia per la chiave diretta sia attraverso la tabella dei calciatori
// ceduti, e PostgREST di fronte a due strade risponde 300 invece di scegliere.
// Stessa ragione per `squadre`, raggiunta da squadra_da e da squadra_a.
const SELECT_OFFERTA = `
  id, stato, crediti, messaggio, created_at, squadra_da, squadra_a,
  richiesto:giocatori!giocatore_id(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra),
  da:squadre!squadra_da(id, nome),
  a:squadre!squadra_a(id, nome),
  offerte_trasferimento_giocatori(giocatori(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra))
`

export default function TrasferimentiPage() {
  const supabase = createClient()

  const [miaSquadra, setMiaSquadra] = useState<string | null>(null)
  const [mercatoAperto, setMercatoAperto] = useState(false)
  const [vetrina, setVetrina] = useState<VoceVetrina[]>([])
  const [offerte, setOfferte] = useState<Offerta[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)

  const [ricerca, setRicerca] = useState('')
  const [filtroRuolo, setFiltroRuolo] = useState('')
  const [filtroSquadra, setFiltroSquadra] = useState('')
  // La vetrina è il caso normale; l'offerta su un giocatore mai messo in
  // vendita è legittima ma va cercata di proposito.
  const [mostraTutti, setMostraTutti] = useState(false)

  const [bersaglio, setBersaglio] = useState<VoceVetrina | null>(null)
  const [azione, setAzione] = useState<AzioneInAttesa | null>(null)

  const carica = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: prof } = await supabase
      .from('profili').select('squadra_id').eq('id', userData.user.id).maybeSingle()
    const mia = prof?.squadra_id ?? null
    setMiaSquadra(mia)

    const { data: regole } = await supabase
      .from('regole_lega').select('fase_mercato_aperta').limit(1).maybeSingle()
    setMercatoAperto(regole?.fase_mercato_aperta ?? false)

    const { data: righe, error: erroreVetrina } = await supabase
      .from('tesseramenti')
      .select('in_vendita, prezzo_richiesto, squadre(id, nome), giocatori(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra)')
    if (erroreVetrina) {
      setErrore(`Impossibile leggere la lista trasferimenti: ${erroreVetrina.message}`)
      setLoading(false)
      return
    }

    const voci = (righe ?? [])
      .map((r) => {
        const g = r.giocatori as unknown as GiocatoreMercato | null
        const s = r.squadre as unknown as { id: string; nome: string } | null
        if (!g || !s) return null
        return { giocatore: g, proprietario: s, in_vendita: r.in_vendita, prezzo_richiesto: r.prezzo_richiesto }
      })
      .filter((v): v is VoceVetrina => v !== null)
      .sort((a, b) =>
        (ORDINE_RUOLI[a.giocatore.ruolo] ?? 99) - (ORDINE_RUOLI[b.giocatore.ruolo] ?? 99) ||
        a.giocatore.nome.localeCompare(b.giocatore.nome))
    setVetrina(voci)

    // La policy fa il filtro: arrivano le proprie trattative e tutti gli
    // scambi conclusi, e nient'altro.
    const { data: off, error: erroreOfferte } = await supabase
      .from('offerte_trasferimento')
      .select(SELECT_OFFERTA)
      .order('created_at', { ascending: false })
    if (erroreOfferte) {
      setErrore(`Impossibile leggere le offerte: ${erroreOfferte.message}`)
      setLoading(false)
      return
    }

    setOfferte((off ?? []).map((o) => {
      const riga = o as unknown as Omit<Offerta, 'ceduti'> & {
        offerte_trasferimento_giocatori: { giocatori: GiocatoreMercato | null }[] | null
      }
      return {
        ...riga,
        ceduti: (riga.offerte_trasferimento_giocatori ?? [])
          .map((x) => x.giocatori)
          .filter((g): g is GiocatoreMercato => g !== null),
      }
    }))

    setErrore(null)
    setLoading(false)
  }, [supabase])

  useEffect(() => { void carica() }, [carica])

  // Un'offerta che arriva deve comparire senza ricaricare. Il traffico è
  // irrisorio: qualche messaggio a trattativa, non uno al secondo come in asta.
  useEffect(() => {
    const canale = supabase
      .channel(`trasferimenti-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offerte_trasferimento' }, () => { void carica() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tesseramenti' }, () => { void carica() })
      .subscribe()
    return () => { supabase.removeChannel(canale) }
  }, [supabase, carica])

  const ruoliMantra = useMemo(() => mantraPresenti(vetrina.map((v) => v.giocatore)), [vetrina])

  const squadre = useMemo(() => {
    const mappa = new Map<string, string>()
    for (const v of vetrina) mappa.set(v.proprietario.id, v.proprietario.nome)
    return [...mappa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [vetrina])

  const vetrinaFiltrata = useMemo(() => {
    const q = ricerca.toLowerCase().trim()
    return vetrina.filter((v) => {
      if (!mostraTutti && !v.in_vendita) return false
      if (filtroSquadra && v.proprietario.id !== filtroSquadra) return false
      if (filtroRuolo && !ruoloCorrisponde(filtroRuolo, v.giocatore.ruolo, v.giocatore.ruolo_mantra)) return false
      if (q && !v.giocatore.nome.toLowerCase().includes(q) && !(v.giocatore.squadra ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [vetrina, mostraTutti, filtroSquadra, filtroRuolo, ricerca])

  const ricevute = useMemo(
    () => offerte.filter((o) => o.squadra_a === miaSquadra && o.stato !== 'ESEGUITA'),
    [offerte, miaSquadra])
  const inviate = useMemo(
    () => offerte.filter((o) => o.squadra_da === miaSquadra && o.stato !== 'ESEGUITA'),
    [offerte, miaSquadra])
  const movimenti = useMemo(() => offerte.filter((o) => o.stato === 'ESEGUITA'), [offerte])

  const chiama = async (rpc: string, argomenti: Record<string, unknown>, successo: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc(rpc, argomenti)
    if (error) setEsito({ tipo: 'errore', testo: error.message })
    else { setEsito({ tipo: 'ok', testo: successo }); await carica() }
  }

  const rispondi = (o: Offerta, accetta: boolean) => setAzione({
    titolo: accetta ? 'Accettare l’offerta' : 'Rifiutare l’offerta',
    pericolo: !accetta,
    messaggio: accetta ? (
      <>
        Cedi <strong className="text-ink">{o.richiesto?.nome}</strong> a{' '}
        <strong className="text-ink">{o.da?.nome}</strong> in cambio di{' '}
        <strong className="text-ink">{descriviContropartita(o)}</strong>.
        Lo scambio non è ancora definitivo: diventerà effettivo quando l’admin lo ratificherà.
      </>
    ) : (
      <>L’offerta di <strong className="text-ink">{o.da?.nome}</strong> verrà archiviata come rifiutata.</>
    ),
    testoConferma: accetta ? 'Accetta' : 'Rifiuta',
    esegui: () => chiama(
      'rispondi_offerta_trasferimento',
      { p_offerta_id: o.id, p_accetta: accetta },
      accetta ? 'Offerta accettata: ora tocca all’admin.' : 'Offerta rifiutata.'),
  })

  const ritira = (o: Offerta) => setAzione({
    titolo: 'Ritirare l’offerta',
    messaggio: <>La tua offerta per <strong className="text-ink">{o.richiesto?.nome}</strong> verrà ritirata.</>,
    testoConferma: 'Ritira',
    esegui: () => chiama('ritira_offerta_trasferimento', { p_offerta_id: o.id }, 'Offerta ritirata.'),
  })

  if (loading) return <div className="p-12 text-center text-ink-mid">Caricamento…</div>

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">Lista trasferimenti</h1>
          <Link href="/mia-rosa" className="fm-btn fm-btn-ghost">Gestisci la mia rosa</Link>
        </div>

        {errore && <div className="fm-alert fm-alert-danger font-semibold">{errore}</div>}

        {esito && (
          <div className={`fm-alert ${esito.tipo === 'ok' ? 'fm-alert-ok' : 'fm-alert-danger'} flex items-start justify-between gap-3`}>
            <span className="font-semibold">{esito.testo}</span>
            <button onClick={() => setEsito(null)} aria-label="Chiudi avviso" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {!mercatoAperto && (
          <div className="fm-alert fm-alert-warn">
            <h2 className="fm-title text-base">Il mercato è chiuso</h2>
            <p className="mt-1 text-sm">Puoi guardare, ma non si possono fare né accettare offerte.</p>
          </div>
        )}

        {/* ---------- Trattative ---------- */}
        {(ricevute.length > 0 || inviate.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <SezioneOfferte
              titolo="Offerte ricevute"
              tinta="fm-panel-head--ambra"
              offerte={ricevute}
              vuoto="Nessuno ti ha ancora fatto un'offerta."
              azioni={(o) => o.stato === 'ATTESA' && mercatoAperto ? (
                <>
                  <button onClick={() => rispondi(o, true)} className="fm-btn fm-btn-primary fm-btn-sm">Accetta</button>
                  <button onClick={() => rispondi(o, false)} className="fm-btn fm-btn-ghost fm-btn-sm">Rifiuta</button>
                </>
              ) : null}
            />
            <SezioneOfferte
              titolo="Offerte inviate"
              tinta=""
              offerte={inviate}
              vuoto="Non hai offerte in giro."
              azioni={(o) => o.stato === 'ATTESA' ? (
                <button onClick={() => ritira(o)} className="fm-btn fm-btn-ghost fm-btn-sm">Ritira</button>
              ) : null}
            />
          </div>
        )}

        {/* ---------- Vetrina ---------- */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--neon">
            <span>{mostraTutti ? 'Tutti i giocatori tesserati' : 'In lista trasferimenti'}</span>
            <span className="fm-label">{vetrinaFiltrata.length}</span>
          </div>

          <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row">
            <input
              type="text"
              placeholder="Cerca calciatore…"
              className="fm-input flex-1"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              aria-label="Cerca calciatore"
            />
            <select
              className="fm-select sm:w-52"
              value={filtroRuolo}
              onChange={(e) => setFiltroRuolo(e.target.value)}
              aria-label="Filtra per ruolo"
            >
              <OpzioniRuolo presenti={ruoliMantra} />
            </select>
            <select
              className="fm-select sm:w-52"
              value={filtroSquadra}
              onChange={(e) => setFiltroSquadra(e.target.value)}
              aria-label="Filtra per fantasquadra"
            >
              <option value="">Tutte le fantasquadre</option>
              {squadre.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-sm text-ink-mid">
            <input
              type="checkbox"
              checked={mostraTutti}
              onChange={(e) => setMostraTutti(e.target.checked)}
              className="h-4 w-4 accent-neon"
            />
            Mostra anche i giocatori non in vetrina — si può trattare per chiunque, non solo per chi è in lista
          </label>

          <div className="fm-table-scroll">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Calciatore</th>
                  <th>Fantasquadra</th>
                  <th className="fm-num">Quotazione</th>
                  <th className="fm-num">Chiede</th>
                  <th className="text-center">Azione</th>
                </tr>
              </thead>
              <tbody>
                {vetrinaFiltrata.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-ink-dim">
                    {mostraTutti ? 'Nessun giocatore con questi filtri.' : 'Nessun giocatore in lista trasferimenti.'}
                  </td></tr>
                ) : vetrinaFiltrata.map((v) => {
                  const mio = v.proprietario.id === miaSquadra
                  return (
                    <tr key={v.giocatore.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={`fm-badge shrink-0 ${badgeRuolo(v.giocatore.ruolo)}`}>{v.giocatore.ruolo}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="fm-nome truncate">{v.giocatore.nome}</span>
                              {v.giocatore.ruolo_mantra && v.giocatore.ruolo_mantra.length > 0 && (
                                <MantraBadge ruoli={v.giocatore.ruolo_mantra} />
                              )}
                            </div>
                            <div className="fm-label truncate">
                              {v.giocatore.squadra}{v.giocatore.eta ? ` · ${v.giocatore.eta}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="font-semibold text-viola-hi">
                        {v.proprietario.nome}
                        {v.in_vendita && <span className="fm-chip fm-chip-neon ml-2">in vetrina</span>}
                      </td>
                      <td className="fm-num">{v.giocatore.quotazione}</td>
                      <td className="fm-num text-ink-mid">
                        {v.in_vendita ? (v.prezzo_richiesto === null ? 'offerte' : `${v.prezzo_richiesto} cr`) : '—'}
                      </td>
                      <td className="text-center">
                        {mio ? (
                          <span className="fm-label">tuo</span>
                        ) : (
                          <button
                            onClick={() => setBersaglio(v)}
                            disabled={!mercatoAperto}
                            className="fm-btn fm-btn-viola fm-btn-sm"
                          >
                            Fai un’offerta
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- Movimenti ---------- */}
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Scambi conclusi</span>
            <span className="fm-label">{movimenti.length}</span>
          </div>
          <div className="fm-panel-body">
            {movimenti.length === 0 ? (
              <p className="text-sm text-ink-dim">Nessuno scambio è ancora andato in porto.</p>
            ) : (
              <ul className="divide-y divide-line">
                {movimenti.map((o) => (
                  <li key={o.id} className="py-2.5 text-sm">
                    <span className="fm-nome">{o.richiesto?.nome}</span>
                    <span className="text-ink-mid"> da </span>
                    <span className="font-semibold text-viola-hi">{o.a?.nome}</span>
                    <span className="text-ink-mid"> a </span>
                    <span className="font-semibold text-viola-hi">{o.da?.nome}</span>
                    <span className="text-ink-mid"> per {descriviContropartita(o)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {bersaglio && (
        <OffertaTrasferimento
          giocatore={bersaglio.giocatore}
          proprietario={bersaglio.proprietario}
          onChiudi={() => setBersaglio(null)}
          onInviata={() => {
            setBersaglio(null)
            setEsito({ tipo: 'ok', testo: 'Offerta inviata.' })
            void carica()
          }}
        />
      )}

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

/** «30 cr + Rossi, Bianchi», o «Rossi» quando i crediti sono zero. */
function descriviContropartita(o: Offerta): string {
  const pezzi: string[] = []
  if (o.crediti > 0) pezzi.push(`${o.crediti} cr`)
  if (o.ceduti.length > 0) pezzi.push(o.ceduti.map((g) => g.nome).join(', '))
  return pezzi.join(' + ') || 'niente'
}

function SezioneOfferte({
  titolo, tinta, offerte, vuoto, azioni,
}: {
  titolo: string
  tinta: string
  offerte: Offerta[]
  vuoto: string
  azioni: (o: Offerta) => React.ReactNode
}) {
  return (
    <div className="fm-panel overflow-hidden">
      <div className={`fm-panel-head ${tinta}`}>
        <span>{titolo}</span>
        <span className="fm-label">{offerte.length}</span>
      </div>
      <div className="fm-panel-body">
        {offerte.length === 0 ? (
          <p className="text-sm text-ink-dim">{vuoto}</p>
        ) : (
          <ul className="divide-y divide-line">
            {offerte.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="fm-nome truncate">{o.richiesto?.nome ?? 'Giocatore rimosso'}</div>
                  <div className="fm-label truncate">
                    {o.da?.nome} → {o.a?.nome} · {descriviContropartita(o)}
                  </div>
                  {o.messaggio && <p className="mt-1 text-sm italic text-ink-mid">«{o.messaggio}»</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={`fm-chip ${ETICHETTA_STATO[o.stato].chip}`}>
                    {ETICHETTA_STATO[o.stato].testo}
                  </span>
                  {azioni(o)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
