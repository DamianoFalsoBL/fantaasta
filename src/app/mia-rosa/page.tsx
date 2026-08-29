'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import MantraBadge from '@/components/MantraBadge'
import Conferma from '@/components/Conferma'
import CambiaPassword from '@/components/CambiaPassword'
import { ORDINE_RUOLI, trasferimentiAttivi, type GiocatoreMercato } from '@/utils/trasferimenti'

type RigaRosa = GiocatoreMercato & {
  prezzo_pagato: number
  in_vendita: boolean
  prezzo_richiesto: number | null
}

type Squadra = { id: string; nome: string; crediti_residui: number; slot_occupati: number }

export default function MiaRosaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [squadra, setSquadra] = useState<Squadra | null>(null)
  const [rosa, setRosa] = useState<RigaRosa[]>([])
  // Quando i trasferimenti sono spenti questa pagina è solo la propria rosa:
  // niente comandi disabilitati, niente avvisi. Un divieto si comunica dove
  // c'è qualcosa da vietare.
  const [mercatoAperto, setMercatoAperto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<{ titolo: string; testo: string } | null>(null)
  // Prezzo digitato riga per riga, prima che venga inviato al server.
  const [prezzi, setPrezzi] = useState<Record<number, string>>({})
  // Riga in attesa di risposta: blocca il doppio invio senza congelare la pagina.
  const [inCorso, setInCorso] = useState<number | null>(null)

  const carica = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { router.push('/'); return }

    const { data: prof } = await supabase
      .from('profili').select('squadra_id').eq('id', userData.user.id).maybeSingle()
    if (!prof?.squadra_id) { setSquadra(null); setLoading(false); return }

    const { data: sq } = await supabase
      .from('squadre').select('id, nome, crediti_residui, slot_occupati')
      .eq('id', prof.squadra_id).maybeSingle()
    if (sq) setSquadra(sq as Squadra)

    setMercatoAperto(await trasferimentiAttivi(supabase))

    // L'errore non si ingoia: una policy che cambia o una colonna che manca
    // devono comparire in pagina, non lasciare una rosa misteriosamente vuota.
    const { data: righe, error } = await supabase
      .from('tesseramenti')
      .select('prezzo_pagato, in_vendita, prezzo_richiesto, giocatori(id, nome, ruolo, squadra, quotazione, eta, ruolo_mantra)')
      .eq('squadra_id', prof.squadra_id)
    if (error) { setErrore(`Impossibile leggere la tua rosa: ${error.message}`); setLoading(false); return }

    const lista = (righe ?? [])
      .map((r) => {
        const g = r.giocatori as unknown as GiocatoreMercato | null
        if (!g) return null
        return { ...g, prezzo_pagato: r.prezzo_pagato, in_vendita: r.in_vendita, prezzo_richiesto: r.prezzo_richiesto }
      })
      .filter((r): r is RigaRosa => r !== null)
      .sort((a, b) =>
        (ORDINE_RUOLI[a.ruolo] ?? 99) - (ORDINE_RUOLI[b.ruolo] ?? 99) || a.nome.localeCompare(b.nome))

    setRosa(lista)
    setPrezzi(Object.fromEntries(lista.map((g) => [g.id, g.prezzo_richiesto?.toString() ?? ''])))
    setErrore(null)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { void carica() }, [carica])

  const aggiorna = async (giocatoreId: number, inVendita: boolean) => {
    setInCorso(giocatoreId)
    const grezzo = (prezzi[giocatoreId] ?? '').trim()
    const prezzo = grezzo === '' ? null : Number(grezzo)

    if (prezzo !== null && (!Number.isFinite(prezzo) || prezzo < 0)) {
      setAvviso({ titolo: 'Prezzo non valido', testo: 'Il prezzo richiesto dev’essere un numero positivo, oppure vuoto.' })
      setInCorso(null)
      return
    }

    const { error } = await supabase.rpc('imposta_vetrina', {
      p_giocatore_id: giocatoreId,
      p_in_vendita: inVendita,
      // Omesso e non `null`: il parametro ha già `DEFAULT NULL` in SQL, e i
      // tipi generati non ammettono null per gli argomenti con predefinito.
      p_prezzo: prezzo ?? undefined,
    })
    if (error) setAvviso({ titolo: 'Operazione non riuscita', testo: error.message })
    else await carica()
    setInCorso(null)
  }

  const inVetrina = useMemo(() => rosa.filter((g) => g.in_vendita).length, [rosa])

  if (loading) return <div className="p-12 text-center text-ink-mid">Caricamento…</div>

  if (!squadra) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="fm-alert fm-alert-warn font-semibold">
          Nessuna squadra associata al tuo profilo: non c’è una rosa da mostrare.
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">La mia rosa</h1>
          {mercatoAperto && (
            <Link href="/trasferimenti" className="fm-btn fm-btn-ghost">
              Vai alla lista trasferimenti
            </Link>
          )}
        </div>

        {errore && <div className="fm-alert fm-alert-danger font-semibold">{errore}</div>}

        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--neon">
            <span className="truncate">{squadra.nome}</span>
            <span className="fm-label shrink-0">
              {squadra.slot_occupati} giocatori · {squadra.crediti_residui} cr
              {mercatoAperto && ` · ${inVetrina} in vetrina`}
            </span>
          </div>

          <div className="p-2 sm:p-3">
            {rosa.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-dim">La tua rosa è vuota.</div>
            ) : (
              <ul className="divide-y divide-line">
                {rosa.map((g) => {
                  const occupato = inCorso === g.id
                  return (
                    <li
                      key={g.id}
                      className={`flex flex-col gap-2 px-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                        g.in_vendita ? 'bg-panel-hi' : ''
                      }`}
                    >
                      {/* Stesse colonne di /rose: il nome si allarga, i ruoli
                          Mantra stanno in una traccia fissa da 5.9rem — i 90px
                          misurati per tre pastiglie — così si incolonnano da
                          una riga all'altra. La pastiglia del reparto che
                          stava prima del nome è sparita: ripeteva quello che i
                          ruoli Mantra dicono già. */}
                      <div
                        className="grid min-w-0 flex-1 items-center gap-2"
                        style={{ gridTemplateColumns: 'minmax(0, 1fr) 5.9rem' }}
                      >
                        <div className="min-w-0">
                          <div className="fm-nome truncate">{g.nome}</div>
                          {/* Sul telefono la riga di dettaglio va a capo invece
                              di troncarsi: qui dice squadra, età, prezzo pagato
                              e quotazione, e con la colonna dei ruoli accanto
                              non ci sta più — misurate 14 righe su 30 troncate
                              a 360px, tutte proprio sulla quotazione. Da sm in
                              su lo spazio c'è e resta su una riga sola. */}
                          <div className="fm-label sm:truncate">
                            {g.squadra}{g.eta ? ` · ${g.eta}` : ''} · pagato {g.prezzo_pagato} cr · quot. {g.quotazione}
                          </div>
                        </div>
                        {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
                      </div>

                      {/* Tutta la colonna dei comandi esiste solo a
                          trasferimenti accesi: da spenti la riga mostra il
                          giocatore e nient'altro. */}
                      {mercatoAperto && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {g.in_vendita && (
                          <span className="fm-chip fm-chip-neon">
                            {g.prezzo_richiesto === null
                              ? 'In vetrina · aperto a offerte'
                              : `In vetrina · ${g.prezzo_richiesto} cr`}
                          </span>
                        )}

                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder="Prezzo"
                          className="fm-input h-9 w-24 min-h-0 py-0 text-sm"
                          aria-label={`Prezzo richiesto per ${g.nome}`}
                          value={prezzi[g.id] ?? ''}
                          disabled={occupato}
                          onChange={(e) => setPrezzi((p) => ({ ...p, [g.id]: e.target.value }))}
                        />

                        <button
                          onClick={() => aggiorna(g.id, true)}
                          disabled={occupato}
                          className={`fm-btn fm-btn-sm ${g.in_vendita ? 'fm-btn-ghost' : 'fm-btn-primary'}`}
                        >
                          {g.in_vendita ? 'Aggiorna prezzo' : 'Lista trasferimenti'}
                        </button>

                        {g.in_vendita && (
                          <button
                            onClick={() => aggiorna(g.id, false)}
                            disabled={occupato}
                            className="fm-btn fm-btn-ghost fm-btn-sm"
                          >
                            Rimuovi dalla lista
                          </button>
                        )}
                      </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {mercatoAperto && (
          <p className="text-xs text-ink-dim">
            Il prezzo è facoltativo: lasciandolo vuoto il giocatore compare come «aperto a offerte».
            In entrambi i casi è solo indicativo e non vincola quanto gli altri possono offrirti.
          </p>
        )}

        {/* Sta qui e non in una voce di menu propria: è la pagina che parla di
            te, e il menu era stato sfoltito apposta. */}
        <CambiaPassword />
      </div>

      <Conferma
        aperta={avviso !== null}
        titolo={avviso?.titolo ?? ''}
        messaggio={avviso?.testo ?? ''}
        tono="pericolo"
        soloConferma
        testoConferma="Ho capito"
        onConferma={() => setAvviso(null)}
        onAnnulla={() => setAvviso(null)}
      />
    </div>
  )
}
