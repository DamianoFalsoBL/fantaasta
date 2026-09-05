'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import RuoliGiocatore from '@/components/RuoliGiocatore'
import Conferma from '@/components/Conferma'

export default function AdminAstaPage() {
  const supabase = createClient()
  const [asteProgrammate, setAsteProgrammate] = useState<any[]>([])
  const [astaCorrente, setAstaCorrente] = useState<any>(null)
  const [partecipanti, setPartecipanti] = useState<string[]>([])
  
  const [ordineChiamata, setOrdineChiamata] = useState<any[]>([])
  const [indiceChiamata, setIndiceChiamata] = useState(1)
  // Il giro e' tornato a capo e aspetta una decisione: nessuno puo' chiamare
  // finche' l'admin non conferma o risorteggia.
  const [giroDaConfermare, setGiroDaConfermare] = useState(false)
  const [squadreMap, setSquadreMap] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [listeEsaurite, setListeEsaurite] = useState(false)
  const [loading, setLoading] = useState(false)
  // Giocatori già passati all'asta e rimasti invenduti: senza questo dato
  // ricomparivano in "Prossime chiamate" identici a chi non è mai stato
  // chiamato, e sembravano voci fantasma.
  const [deserti, setDeserti] = useState<Set<number>>(new Set())
  // Spostamento manuale del turno: finora l'unico modo di toccarlo era
  // risorteggiare tutto l'ordine.
  const [turnoDaImpostare, setTurnoDaImpostare] = useState<{ id: string; nome: string } | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  // Chiamata per conto di un manager assente: la sua lista chiamate.
  // `asteProgrammate` non basta — e' tagliata ai primi dieci e porta i nomi
  // delle squadre, non gli id — quindi qui si tiene l'elenco intero.
  const [inListaCompleta, setInListaCompleta] = useState<any[]>([])
  // Chi non ha più nulla da chiamare, o ha la rosa piena. Restano nell'ordine
  // e restano cliccabili — l'admin deve poterle comunque selezionare — ma
  // sbiadite, perché a colpo d'occhio si veda chi è ancora in gara.
  const [concluse, setConcluse] = useState<Set<string>>(new Set())

  const loadData = async () => {
    // 1. Carica asta in corso o in chiamata.
    // Come nel tabellone: niente `maybeSingle()`, che oltre a esporre la
    // risposta singolare non aveva nemmeno un `limit(1)`, quindi bastavano due
    // righe non terminate per far fallire tutta la Regia.
    const { data: correnti, error: erroreCorrente } = await supabase
      .from('aste')
      // `squadre!squadra_in_testa`: da quando esiste massimi_asta, che ha una
      // chiave verso `aste` e una verso `squadre`, PostgREST vede due percorsi
      // fra le due tabelle e rifiuta l'incorporamento ambiguo con un 300.
      // Nominare la chiave toglie l'ambiguita'.
      .select('*, giocatori(*), squadre!squadra_in_testa(*)')
      .in('stato', ['IN_CORSO', 'CHIAMATA'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (erroreCorrente) {
      setError(`Impossibile leggere l'asta in corso: ${erroreCorrente.message}`)
      return
    }
    const corrente = correnti?.[0] ?? null
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
      // `squadra_id` serve a capire chi ha ancora qualcuno da chiamare: senza,
      // nella barra dell'ordine tutte le squadre si somigliano fino alla fine.
      .select('giocatore_id, squadra_id, giocatori(*), squadre(nome)')
    
    if (dbError) {
      setError(`Errore DB: ${dbError.message}`)
      return
    }

    // Chi ha ancora almeno un giocatore libero in lista è ancora in gara.
    const conQualcunoDaChiamare = new Set<string>()

    if (liste) {
      let tesseratiCount = 0
      const map = new Map()

      liste.forEach((r: any) => {
        if (r.giocatori) {
          if (r.giocatori.stato === 'LIBERO') {
            // `contendentiId` accanto ai nomi: la chiamata per conto deve
            // filtrare per squadra, e i nomi non sono chiavi.
            const player = map.get(r.giocatore_id) || { ...r.giocatori, contendenti: [], contendentiId: [] }
            if (r.squadre) player.contendenti.push(r.squadre.nome)
            if (r.squadra_id) player.contendentiId.push(r.squadra_id)
            map.set(r.giocatore_id, player)
            if (r.squadra_id) conQualcunoDaChiamare.add(r.squadra_id)
          } else {
            tesseratiCount++
          }
        }
      })

      if (corrente) {
         map.delete(corrente.giocatore_id)
      }
      
      // Intero per la chiamata per conto, tagliato ai primi dieci per l'elenco
      // delle prossime chiamate, che serve solo a dare un'idea.
      setInListaCompleta(Array.from(map.values()))
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
    const { data: regole } = await supabase
      .from('regole_lega').select('ordine_chiamata, indice_chiamata, slot_totali, giro_da_confermare').limit(1).single()
    if (regole) {
      setOrdineChiamata(regole.ordine_chiamata || [])
      setIndiceChiamata(regole.indice_chiamata || 1)
      setGiroDaConfermare(regole.giro_da_confermare ?? false)
    }
    const slotTotali = regole?.slot_totali ?? 30

    // 4. Carica squadre per la mappa dei nomi
    const { data: teams } = await supabase.from('squadre').select('id, nome, slot_occupati')
    if (teams) {
      const sMap: Record<string, string> = {}
      teams.forEach((t: any) => sMap[t.id] = t.nome)
      setSquadreMap(sMap)

      // Due modi di aver finito, entrambi definitivi per la chiamata: non
      // avere più nessuno in lista, o avere la rosa piena.
      setConcluse(new Set(
        teams
          .filter((t: any) => !conQualcunoDaChiamare.has(t.id) || (t.slot_occupati ?? 0) >= slotTotali)
          .map((t: any) => t.id)
      ))
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

  /**
   * Chiama un giocatore per conto della squadra di turno.
   *
   * Usa `prenota_chiamata` con la delega e **non** `avvia_asta_admin`: sono due
   * azioni diverse. La prima mette in testa chi chiama, la seconda cerca fra
   * chi ha il giocatore in lista — e con quella, chiamando per una squadra che
   * il giocatore non ce l'ha in lista, l'asta sarebbe finita a qualcun altro.
   */
  // I giocatori che la squadra di turno ha in lista chiamate e sono ancora
  // liberi: sono quelli che chiamerebbe lei, ed e' l'elenco che il manager
  // assente ha lasciato all'admin.
  const listaDelTurno = (() => {
    const squadraId = ordineChiamata[indiceChiamata - 1]
    if (!squadraId) return []
    return inListaCompleta.filter((g) => g.contendentiId?.includes(squadraId))
  })()

  const chiamaPerConto = async (g: any) => {
    const squadraId = ordineChiamata[indiceChiamata - 1]
    if (!squadraId) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('prenota_chiamata', {
      p_giocatore_id: g.id,
      p_squadra_delega: squadraId,
    })
    if (error) setError(error.message)
    else {
      setEsito(`${g.nome} chiamato per ${squadreMap[squadraId]} a ${g.quotazione} cr. Ora avvia il timer.`)
      await loadData()
    }
    setLoading(false)
  }

  const chiudiAsta = async (id: string) => {
    setError(null)
    // L'errore veniva scartato: una chiusura fallita risultava indistinguibile
    // da una riuscita.
    const { error } = await supabase.rpc('chiudi_asta', { p_asta_id: id })
    if (error) setError(`Errore chiusura asta: ${error.message}`)
    loadData()
  }

  const impostaTurno = async (squadraId: string, nome: string) => {
    setError(null)
    const { error } = await supabase.rpc('admin_imposta_turno', { p_squadra_id: squadraId })
    if (error) setError(`Errore spostamento turno: ${error.message}`)
    else setEsito(`Turno di chiamata spostato a ${nome}.`)
    loadData()
  }

  const sorteggiaOrdine = async () => {
    setLoading(true)
    const { error } = await supabase.rpc('genera_ordine_chiamata')
    if (error) {
      setError(`Errore sorteggio: ${error.message}`)
    } else {
      loadData()
    }
    setLoading(false)
  }

  /**
   * «Va bene cosi'»: si riparte con lo stesso ordine, dal primo.
   *
   * E' l'altra meta' della decisione che il blocco di fine giro impone. Senza,
   * l'unico modo di sbloccare sarebbe risorteggiare — cioe' cambiare l'ordine
   * per forza, anche quando quello che c'e' andava benissimo.
   */
  const confermaOrdine = async () => {
    setLoading(true)
    const { error } = await supabase.rpc('admin_conferma_ordine')
    if (error) {
      setError(`Errore conferma: ${error.message}`)
    } else {
      loadData()
    }
    setLoading(false)
  }

  return (
    <div className="fm-pagina fm-pagina-stretta space-y-4">
      <h1 className="fm-title text-2xl sm:text-3xl">Regia aste</h1>

      {/* SEZIONE ORDINE DI CHIAMATA */}
      <div className="fm-panel overflow-hidden">
        <div className="fm-panel-head">
          <span>Ordine di chiamata</span>
          {/* Il pulsante compare solo a giro finito, accanto a quello di
              sempre: e' una decisione che si prende una volta per giro, e
              tenerlo sempre acceso lo farebbe premere per abitudine. */}
          {giroDaConfermare && (
            <button
              onClick={confermaOrdine}
              disabled={loading}
              className="fm-btn fm-btn-primary fm-btn-sm"
            >
              Conferma l&apos;ordine
            </button>
          )}
          <button
            onClick={sorteggiaOrdine}
            disabled={loading}
            className="fm-btn fm-btn-ghost fm-btn-sm"
          >
            Sorteggia nuovo ordine
          </button>
        </div>

        {/* Detto a parole e non solo col pulsante: senza, l'admin vedrebbe i
            manager ricevere «Il giro e' finito» e non saprebbe che la palla e'
            passata a lui. */}
        {giroDaConfermare && (
          <div className="border-b border-ambra/50 bg-ambra/15 px-3 py-2.5 text-sm font-semibold text-ambra">
            Giro completato: nessuno può chiamare finché non confermi
            l&apos;ordine o ne sorteggi uno nuovo.
          </div>
        )}
        {ordineChiamata.length > 0 ? (
          <>
            <div className="flex gap-2 overflow-x-auto p-3 pb-1 md:flex-wrap md:overflow-visible">
              {ordineChiamata.map((sqId, idx) => {
                const isTurno = (idx + 1) === indiceChiamata;
                const nome = squadreMap[sqId] || 'Squadra'
                // Sbiadita, non nascosta e non disattivata: chi ha finito serve
                // ancora, perché l'admin può doverle riassegnare il turno dopo
                // un annullamento.
                const haFinito = concluse.has(sqId)
                return (
                  /* Le pillole sono diventate cliccabili: servono a spostare il
                     turno senza risorteggiare tutto l'ordine, per esempio dopo
                     l'annullamento di un acquisto. */
                  <button
                    key={idx}
                    type="button"
                    onClick={() => !isTurno && setTurnoDaImpostare({ id: sqId, nome })}
                    disabled={isTurno}
                    title={
                      isTurno ? 'È già il suo turno'
                      : haFinito ? `${nome} ha finito le chiamate — puoi comunque spostarle il turno`
                      : `Sposta il turno di chiamata a ${nome}`
                    }
                    className={`fm-chip shrink-0 ${
                      isTurno ? 'fm-chip-attivo cursor-default' : 'cursor-pointer hover:border-neon hover:text-ink'
                    } ${haFinito && !isTurno ? 'opacity-40 hover:opacity-100' : ''}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      isTurno ? 'bg-void text-neon' : 'bg-panel-hover text-ink-dim'
                    }`}>
                      {idx + 1}
                    </span>
                    {nome}
                    {haFinito && <span className="ml-1 text-[9px] text-ink-dim">✓</span>}
                  </button>
                );
              })}
            </div>
            <p className="px-3 pb-3 text-[11px] text-ink-dim">
              Tocca una squadra per spostarle il turno di chiamata.
              {concluse.size > 0 && ' Le squadre sbiadite con la spunta hanno finito: rosa piena o nessuno più in lista.'}
            </p>
          </>
        ) : (
          <div className="p-3 text-sm text-ink-dim">Nessun ordine impostato. Clicca su Sorteggia.</div>
        )}
      </div>

      {/* Gli avvisi stanno subito sotto la barra dell'ordine di chiamata.
          L'errore era in fondo alla pagina, sotto il pannello dell'asta: chi
          premeva una pillola in cima non lo vedeva nemmeno. */}
      {esito && (
        <div className="fm-alert fm-alert-ok flex items-start justify-between gap-3">
          <span className="font-semibold">{esito}</span>
          <button onClick={() => setEsito(null)} aria-label="Chiudi avviso" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {error && (
        <div className="fm-alert fm-alert-danger flex items-start justify-between gap-3">
          <span className="font-semibold">{error}</span>
          <button onClick={() => setError(null)} aria-label="Chiudi errore" className="shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

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

      {/* Chiamata per conto di un manager assente.
          Sta sopra «Prossime chiamate» e non dentro: quella lista mostra solo i
          giocatori che qualcuno ha in `liste_aste`, e il caso per cui questo
          pannello esiste e' proprio il giocatore che non ci sta. */}
      {!astaCorrente && ordineChiamata.length > 0 && (
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <div>
              <span>Chiama per conto di</span>
              <p className="mt-0.5 text-xs font-normal normal-case tracking-normal text-ink-dim">
                Per un manager assente. Qui ci sono i giocatori della <b>sua</b>
                lista chiamate: chiamandone uno risulta chiamato da lui, al
                prezzo base.
              </p>
            </div>
          </div>

          <div className="fm-panel-body space-y-3">
            <div>
              <label className="fm-label mb-1 block">Squadra</label>
              <div className="fm-alert fm-alert-info">
                Tocca a <strong>{squadreMap[ordineChiamata[indiceChiamata - 1]] ?? '—'}</strong>.
                Si chiama solo per chi è di turno: per anticipare qualcuno, tocca
                prima il suo nome nella barra dell&apos;ordine qui sopra.
              </div>
            </div>

            {listaDelTurno.length === 0 ? (
              <p className="text-sm text-ink-dim">
                Questa squadra non ha piu' giocatori liberi nella sua lista chiamate.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-line">
                <div className="divide-y divide-line">
                  {listaDelTurno.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-3 p-2.5">
                      <div className="min-w-0">
                        <div className="fm-nome truncate">{g.nome}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-mid">
                          <span>{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</span>
                          <RuoliGiocatore ruolo={g.ruolo} ruoloMantra={g.ruolo_mantra} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="fm-badge fm-badge-good">{g.quotazione} cr</span>
                        <button
                          onClick={() => chiamaPerConto(g)}
                          disabled={loading}
                          className="fm-btn fm-btn-primary fm-btn-sm"
                        >
                          Chiama
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                <span>{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</span>
                <RuoliGiocatore ruolo={g.ruolo} ruoloMantra={g.ruolo_mantra} />
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

      <Conferma
        aperta={turnoDaImpostare !== null}
        titolo="Spostare il turno di chiamata"
        messaggio={
          <>
            Il turno passerà a <strong className="text-ink">{turnoDaImpostare?.nome}</strong>, che sarà
            la prossima squadra a poter chiamare. Non cambia l&apos;ordine delle altre e non tocca le
            aste già concluse.
          </>
        }
        testoConferma="Sposta il turno"
        onAnnulla={() => setTurnoDaImpostare(null)}
        onConferma={() => {
          const scelta = turnoDaImpostare
          setTurnoDaImpostare(null)
          if (scelta) void impostaTurno(scelta.id, scelta.nome)
        }}
      />
    </div>
  )
}
