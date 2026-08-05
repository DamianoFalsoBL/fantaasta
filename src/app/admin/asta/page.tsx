'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import MantraBadge from '@/components/MantraBadge'

export default function AdminAstaPage() {
  const supabase = createClient()
  const [asteProgrammate, setAsteProgrammate] = useState<any[]>([])
  const [astaCorrente, setAstaCorrente] = useState<any>(null)
  const [partecipanti, setPartecipanti] = useState<string[]>([])
  
  const [ordineChiamata, setOrdineChiamata] = useState<any[]>([])
  const [indiceChiamata, setIndiceChiamata] = useState(1)
  const [squadreMap, setSquadreMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [listeEsaurite, setListeEsaurite] = useState(false)
  const [loading, setLoading] = useState(false)
  // Giocatori già passati all'asta e rimasti invenduti: senza questo dato
  // ricomparivano in "Prossime chiamate" identici a chi non è mai stato
  // chiamato, e sembravano voci fantasma.
  const [deserti, setDeserti] = useState<Set<number>>(new Set())

  const loadData = async () => {
    // 1. Carica asta in corso o in chiamata
    const { data: corrente } = await supabase.from('aste').select('*, giocatori(*), squadre(*)').in('stato', ['IN_CORSO', 'CHIAMATA']).maybeSingle()
    setAstaCorrente(corrente)

    // Un'asta chiusa senza nessuno in testa è andata deserta.
    const { data: asteDeserte } = await supabase
      .from('aste')
      .select('giocatore_id')
      .eq('stato', 'CHIUSA')
      .is('squadra_in_testa', null)
    setDeserti(new Set((asteDeserte ?? []).map((a: { giocatore_id: number }) => a.giocatore_id)))

    if (corrente) {
      // Carica i partecipanti (le squadre che hanno in lista questo giocatore)
      const { data: partData } = await supabase
        .from('liste_aste')
        .select('squadre(nome)')
        .eq('giocatore_id', corrente.giocatore_id)
      setPartecipanti(partData?.map((p: any) => p.squadre.nome) || [])
    } else {
      setPartecipanti([])
    }

    // 2. Carica i giocatori dalle liste_aste che sono ancora LIBERI e non hanno un'asta in corso
    const { data: liste, error: dbError } = await supabase
      .from('liste_aste')
      .select('giocatore_id, giocatori(*), squadre(nome)')
    
    if (dbError) {
      setError(`Errore DB: ${dbError.message}`)
      return
    }

    if (liste) {
      let tesseratiCount = 0
      const map = new Map()
      
      liste.forEach((r: any) => {
        if (r.giocatori) {
          if (r.giocatori.stato === 'LIBERO') {
            const player = map.get(r.giocatore_id) || { ...r.giocatori, contendenti: [] }
            if (r.squadre) player.contendenti.push(r.squadre.nome)
            map.set(r.giocatore_id, player)
          } else {
            tesseratiCount++
          }
        }
      })
      
      if (corrente) {
         map.delete(corrente.giocatore_id)
      }
      
      setAsteProgrammate(Array.from(map.values()).slice(0, 10))

      // Le righe di liste_aste dei giocatori già assegnati restano apposta:
      // servono a ripristinare la contesa se l'acquisto viene annullato.
      // Non sono quindi un errore, e non vanno segnalate in rosso: il caso
      // "niente da chiamare" viene mostrato dentro Prossime Chiamate.
      setListeEsaurite(map.size === 0 && tesseratiCount > 0)
      setError(null)
    } else {
      setError('Errore di connessione o nessuna lista pre-asta trovata.')
    }

    // 3. Carica regole_lega per ordine chiamata
    const { data: regole } = await supabase.from('regole_lega').select('ordine_chiamata, indice_chiamata').limit(1).single()
    if (regole) {
      setOrdineChiamata(regole.ordine_chiamata || [])
      setIndiceChiamata(regole.indice_chiamata || 1)
    }

    // 4. Carica squadre per la mappa dei nomi
    const { data: teams } = await supabase.from('squadre').select('id, nome')
    if (teams) {
      const sMap: Record<string, string> = {}
      teams.forEach((t: any) => sMap[t.id] = t.nome)
      setSquadreMap(sMap)
    }
  }

  useEffect(() => {
    loadData()

    const channel = supabase.channel(`admin_realtime_aste-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aste' }, () => {
         loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regole_lega' }, () => {
         loadData()
      })
      .subscribe()
    
    return () => { supabase.removeChannel(channel) }
  }, [])

  const avviaAsta = async (giocatoreId: number) => {
    setError(null)
    const { data, error } = await supabase.rpc('avvia_asta_admin', {
      p_giocatore_id: giocatoreId
    })

    if (error) {
      setError(`Errore avvio asta: ${error.message}`)
    } else {
      loadData()
    }
  }

  const chiudiAsta = async (id: string) => {
    setError(null)
    // L'errore veniva scartato: una chiusura fallita risultava indistinguibile
    // da una riuscita.
    const { error } = await supabase.rpc('chiudi_asta', { p_asta_id: id })
    if (error) setError(`Errore chiusura asta: ${error.message}`)
    loadData()
  }

  const sorteggiaOrdine = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('genera_ordine_chiamata')
    if (error) {
      setError(`Errore sorteggio: ${error.message}`)
    } else {
      loadData()
    }
    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="fm-title text-2xl sm:text-3xl">Regia asta live</h1>

      {/* SEZIONE ORDINE DI CHIAMATA */}
      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>Ordine di chiamata</span>
          <button
            onClick={sorteggiaOrdine}
            disabled={loading}
            className="fm-btn fm-btn-ghost fm-btn-sm"
          >
            🎲 Sorteggia nuovo ordine
          </button>
        </div>
        {ordineChiamata.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto p-3 md:flex-wrap md:overflow-visible">
            {ordineChiamata.map((sqId, idx) => {
              const isTurno = (idx + 1) === indiceChiamata;
              return (
                <div
                  key={idx}
                  className={`fm-chip shrink-0 ${isTurno ? 'fm-chip-attivo' : ''}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isTurno ? 'bg-void text-neon' : 'bg-panel-hover text-ink-dim'
                  }`}>
                    {idx + 1}
                  </span>
                  {squadreMap[sqId] || 'Squadra'}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 text-sm text-ink-dim">Nessun ordine impostato. Clicca su Sorteggia.</div>
        )}
      </div>

      {astaCorrente ? (
        <div className="fm-panel overflow-hidden">
          <div className={`fm-panel-head ${astaCorrente.stato === 'CHIAMATA' ? 'fm-panel-head--ambra' : 'fm-panel-head--rosso'}`}>
            <span>
              {astaCorrente.stato === 'CHIAMATA' ? '⏳ Asta prenotata · in attesa di avvio' : '🔴 Asta in corso'}
            </span>
          </div>
          <div className="fm-panel-body">
            <div className="fm-nome text-2xl">{astaCorrente.giocatori.nome}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="fm-chip">Prezzo <strong className="text-ink">{astaCorrente.prezzo_corrente}</strong></span>
              <span className={`fm-chip ${astaCorrente.squadre?.nome ? 'fm-chip-neon' : ''}`}>
                In testa: {astaCorrente.squadre?.nome || 'nessuna'}
              </span>
              {astaCorrente.scadenza_corrente && (
                <span className="fm-chip">
                  Scadenza {new Date(astaCorrente.scadenza_corrente).toLocaleTimeString('it-IT')}
                </span>
              )}
            </div>

            {partecipanti.length > 0 && (
              <div className="mt-4 rounded-md border border-line bg-panel-hi p-3">
                <h3 className="fm-label mb-2">👥 Squadre in lizza</h3>
                <div className="flex flex-wrap gap-1.5">
                  {partecipanti.map((squadra, idx) => (
                    <span key={idx} className="fm-chip">{squadra}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              {astaCorrente.stato === 'CHIAMATA' ? (
                <button
                  onClick={async () => {
                    setError(null)
                    const { error } = await supabase.rpc('avvia_timer_chiamata', { p_asta_id: astaCorrente.id })
                    if (error) setError(`Errore avvio timer: ${error.message}`)
                    loadData()
                  }}
                  className="fm-btn fm-btn-primary"
                >
                  ▶️ Avvia timer
                </button>
              ) : (
                <button onClick={() => chiudiAsta(astaCorrente.id)} className="fm-btn fm-btn-danger">
                  ⏹️ Chiudi asta e assegna
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="fm-panel p-6 text-center">
          <h2 className="fm-title text-lg text-ink-mid">Nessuna asta in corso</h2>
        </div>
      )}

      {error && <div className="fm-alert fm-alert-danger font-semibold">{error}</div>}

      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>Prossime chiamate</span>
          {asteProgrammate.length > 0 && <span className="fm-label">{asteProgrammate.length}</span>}
        </div>

        {asteProgrammate.length === 0 && !error ? (
          <div className="p-6 text-center text-sm text-ink-dim">
            {listeEsaurite
              ? 'Tutte le chiamate sono state completate: ogni giocatore in lista è già stato assegnato.'
              : "Nessun giocatore in lista d'attesa. Assicurati di aver importato il file Aste."}
          </div>
        ) : (
        <div className="divide-y divide-line">
        {asteProgrammate.map(g => (
          <div key={g.id} className="flex flex-col gap-3 p-3 transition hover:bg-panel-hover sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="fm-nome text-lg">{g.nome}</span>
                {/* Un'asta chiusa senza nessuno in testa è andata deserta: il
                    giocatore resta chiamabile, ma va detto che ci è già
                    passato, altrimenti sembra una voce mai lavorata. */}
                {deserti.has(g.id) && (
                  <span className="fm-chip fm-chip-ambra" title="Già messo all'asta senza offerte">
                    già andata deserta
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-mid">
                <span>{g.ruolo} · {g.squadra}{g.eta ? ` · ${g.eta}` : ''}</span>
                {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
              </div>
              {g.contendenti && g.contendenti.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="fm-label">Contendenti</span>
                  {g.contendenti.map((c: string) => <span key={c} className="fm-chip">{c}</span>)}
                </div>
              )}
            </div>
            <button
              onClick={() => avviaAsta(g.id)}
              disabled={!!astaCorrente}
              className="fm-btn fm-btn-primary w-full shrink-0 sm:w-auto"
            >
              Avvia asta
            </button>
          </div>
        ))}
        </div>
        )}
      </div>
    </div>
  )
}
