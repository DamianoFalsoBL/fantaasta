'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import Conferma from '@/components/Conferma'
import { badgeRuolo, ETICHETTA_STATO, type GiocatoreMercato, type StatoOfferta } from '@/utils/trasferimenti'

type Squadra = { id: string; nome: string; crediti_residui: number; slot_occupati: number }

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

// Doppia disambiguazione obbligatoria: `squadre` è raggiungibile da squadra_da
// e da squadra_a, `giocatori` sia direttamente sia passando dai calciatori
// ceduti. Senza gli hint PostgREST risponde 300 Multiple Choices.
const SELECT_OFFERTA = `
  id, stato, crediti, messaggio, created_at, squadra_da, squadra_a,
  richiesto:giocatori!giocatore_id(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra),
  da:squadre!squadra_da(id, nome),
  a:squadre!squadra_a(id, nome),
  offerte_trasferimento_giocatori(giocatori(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra))
`

export default function AdminTrasferimentiPage() {
  const supabase = createClient()

  const [offerte, setOfferte] = useState<Offerta[]>([])
  const [squadre, setSquadre] = useState<Record<string, Squadra>>({})
  const [mercatoAperto, setMercatoAperto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<{ tipo: 'ok' | 'errore'; testo: string } | null>(null)
  const [azione, setAzione] = useState<AzioneInAttesa | null>(null)

  const carica = useCallback(async () => {
    const { data: sq } = await supabase
      .from('squadre').select('id, nome, crediti_residui, slot_occupati')
    setSquadre(Object.fromEntries(((sq ?? []) as Squadra[]).map((s) => [s.id, s])))

    const { data: regole } = await supabase
      .from('regole_lega').select('fase_mercato_aperta').limit(1).maybeSingle()
    setMercatoAperto(regole?.fase_mercato_aperta ?? false)

    const { data, error } = await supabase
      .from('offerte_trasferimento')
      .select(SELECT_OFFERTA)
      .in('stato', ['ACCETTATA', 'ESEGUITA', 'RESPINTA'])
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) { setErrore(`Impossibile leggere le offerte: ${error.message}`); setLoading(false); return }

    setOfferte((data ?? []).map((o) => {
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

  const daRatificare = useMemo(() => offerte.filter((o) => o.stato === 'ACCETTATA'), [offerte])
  const archivio = useMemo(() => offerte.filter((o) => o.stato !== 'ACCETTATA'), [offerte])

  const decidi = (o: Offerta, approva: boolean) => setAzione({
    titolo: approva ? 'Eseguire lo scambio' : 'Respingere lo scambio',
    pericolo: !approva,
    messaggio: approva ? (
      <>
        Stai per spostare <strong className="text-ink">{o.richiesto?.nome}</strong> a{' '}
        <strong className="text-ink">{o.da?.nome}</strong>
        {o.ceduti.length > 0 && (
          <> e <strong className="text-ink">{o.ceduti.map((g) => g.nome).join(', ')}</strong> a{' '}
          <strong className="text-ink">{o.a?.nome}</strong></>
        )}
        {o.crediti > 0 && <>, con <strong className="text-ink">{o.crediti} crediti</strong> che passano di mano</>}.
        {' '}Lo scambio <strong className="text-ink">non si può annullare</strong>: non esiste un ripristino
        come per le aste.
      </>
    ) : (
      <>L’offerta verrà archiviata come non ratificata. Nulla si muove.</>
    ),
    testoConferma: approva ? 'Esegui lo scambio' : 'Respingi',
    esegui: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('esegui_trasferimento', {
        p_offerta_id: o.id,
        p_approva: approva,
      })
      if (error) { setEsito({ tipo: 'errore', testo: error.message }); return }
      const decadute = (data as { offerte_decadute?: number } | null)?.offerte_decadute ?? 0
      setEsito({
        tipo: 'ok',
        testo: approva
          ? `Scambio eseguito.${decadute > 0 ? ` ${decadute} altre offerte sono decadute.` : ''}`
          : 'Offerta respinta.',
      })
      await carica()
    },
  })

  if (loading) return <div className="p-12 text-center text-ink-mid">Caricamento…</div>

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">Ratifica trasferimenti</h1>
          <Link href="/admin/riepilogo" className="fm-btn fm-btn-ghost">Riepilogo e budget</Link>
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
            Il mercato è chiuso: finché resta così, nessuno scambio può essere eseguito.
          </div>
        )}

        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--ambra">
            <span>In attesa di ratifica</span>
            <span className="fm-label">{daRatificare.length}</span>
          </div>
          <div className="fm-panel-body space-y-3">
            {daRatificare.length === 0 ? (
              <p className="text-sm text-ink-dim">Nessuno scambio da ratificare.</p>
            ) : daRatificare.map((o) => {
              const sqDa = squadre[o.squadra_da]
              const sqA = squadre[o.squadra_a]
              const n = o.ceduti.length
              return (
                <div key={o.id} className="rounded-md border border-line bg-panel-hi p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <VersoScambio
                      titolo={`${sqDa?.nome ?? '—'} riceve`}
                      giocatori={o.richiesto ? [o.richiesto] : []}
                      crediti={0}
                    />
                    <VersoScambio
                      titolo={`${sqA?.nome ?? '—'} riceve`}
                      giocatori={o.ceduti}
                      crediti={o.crediti}
                    />
                  </div>

                  {o.messaggio && <p className="mt-2 text-sm italic text-ink-mid">«{o.messaggio}»</p>}

                  {/* L'effetto in cifre: è quello che l'admin deve poter
                      controllare prima di premere, perché dopo non si torna. */}
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <Effetto
                      squadra={sqDa}
                      crediti={-o.crediti}
                      slot={1 - n}
                      prezzo={`${o.richiesto?.nome ?? 'Il giocatore'} risulterà costato ${o.crediti + o.ceduti.reduce((s, g) => s + g.quotazione, 0)} cr`}
                    />
                    <Effetto
                      squadra={sqA}
                      crediti={o.crediti}
                      slot={n - 1}
                      prezzo={n > 0
                        ? `${o.richiesto?.quotazione ?? 0} cr ripartiti fra ${n} calciator${n === 1 ? 'e' : 'i'}`
                        : 'Nessun calciatore in entrata'}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => decidi(o, true)}
                      disabled={!mercatoAperto}
                      className="fm-btn fm-btn-primary fm-btn-sm"
                    >
                      Esegui lo scambio
                    </button>
                    <button onClick={() => decidi(o, false)} className="fm-btn fm-btn-danger fm-btn-sm">
                      Respingi
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Archivio</span>
            <span className="fm-label">{archivio.length}</span>
          </div>
          <div className="fm-panel-body">
            {archivio.length === 0 ? (
              <p className="text-sm text-ink-dim">Nessuno scambio ancora deciso.</p>
            ) : (
              <ul className="divide-y divide-line">
                {archivio.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="fm-nome">{o.richiesto?.nome}</span>
                      <span className="text-ink-mid"> · {o.a?.nome} → {o.da?.nome}</span>
                    </span>
                    <span className={`fm-chip ${ETICHETTA_STATO[o.stato].chip}`}>
                      {ETICHETTA_STATO[o.stato].testo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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

function VersoScambio({
  titolo, giocatori, crediti,
}: { titolo: string; giocatori: GiocatoreMercato[]; crediti: number }) {
  return (
    <div className="rounded-md border border-line bg-panel p-2.5">
      <div className="fm-label mb-1.5">{titolo}</div>
      {giocatori.length === 0 && crediti === 0 && <div className="text-sm text-ink-dim">niente</div>}
      <ul className="space-y-1">
        {giocatori.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <span className={`fm-badge shrink-0 ${badgeRuolo(g.ruolo)}`}>{g.ruolo}</span>
            <span className="fm-nome truncate">{g.nome}</span>
            <span className="fm-label shrink-0">q. {g.quotazione}</span>
          </li>
        ))}
      </ul>
      {crediti > 0 && <div className="mt-1.5 text-sm font-bold text-neon">+ {crediti} crediti</div>}
    </div>
  )
}

function Effetto({
  squadra, crediti, slot, prezzo,
}: { squadra?: Squadra; crediti: number; slot: number; prezzo: string }) {
  if (!squadra) return null
  const segno = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-2 text-ink-mid">
      <span className="font-semibold text-ink">{squadra.nome}</span>
      {' · '}crediti {squadra.crediti_residui} → <span className="tabular-nums text-ink">{squadra.crediti_residui + crediti}</span>
      {' ('}{segno(crediti)}{')'}
      {' · '}slot {squadra.slot_occupati} → <span className="tabular-nums text-ink">{squadra.slot_occupati + slot}</span>
      <div className="mt-0.5 text-ink-dim">{prezzo}</div>
    </div>
  )
}
