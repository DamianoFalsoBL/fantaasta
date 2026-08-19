'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import MantraBadge from '@/components/MantraBadge'

/**
 * `aste.abbandoni` è una colonna jsonb, quindi arriva tipizzata come Json.
 * Qui contiene sempre un array di id squadra, ma va ristretto esplicitamente.
 */
function elencoAbbandoni(valore: unknown): string[] {
  return Array.isArray(valore) ? valore.filter((v): v is string => typeof v === 'string') : []
}

export default function TabelloneAsta({ squadraId, isAdmin }: { squadraId: string | null, isAdmin?: boolean }) {
  const supabase = createClient()
  const [asta, setAsta] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeKo, setRealtimeKo] = useState(false)
  
  // Per utenti: la propria busta
  const [miaLista, setMiaLista] = useState<any[]>([])
  
  // Per admin: delega
  const [squadre, setSquadre] = useState<any[]>([])
  const [squadraDelegaId, setSquadraDelegaId] = useState<string>('')
  
  // Partecipanti in gara
  const [partecipanti, setPartecipanti] = useState<any[]>([])
  
  // Ordine di chiamata
  // Massimo offribile: si legge dalla stessa funzione che il server usa per
  // accettare o rifiutare l'offerta, così il numero mostrato non può divergere
  // da quello applicato.
  const [massimoOffribile, setMassimoOffribile] = useState<number | null>(null)
  const [massimoDelega, setMassimoDelega] = useState<number | null>(null)
  const [squadreAttive, setSquadreAttive] = useState<Set<string>>(new Set())
  // Con la rosa al completo il server rifiuta ogni offerta (`rosa_completa` in
  // piazza_offerta_asta): senza questo flag i comandi restavano attivi e ogni
  // click finiva in errore.
  const [rosaPiena, setRosaPiena] = useState(false)
  // Reparto saturo per il giocatore in asta: oggi vale solo per i portieri.
  // Si chiede al server la stessa funzione che poi rifiuta l'offerta.
  const [ruoloPieno, setRuoloPieno] = useState(false)
  const [portieriDisponibili, setPortieriDisponibili] = useState(0)
  // Tetto automatico della propria squadra su quest'asta. Le RLS su
  // massimi_asta fanno vedere solo la propria riga, quindi non serve filtrare
  // per squadra: la query torna la riga giusta o niente.
  const [massimoAuto, setMassimoAuto] = useState<number | null>(null)
  const [campoMassimo, setCampoMassimo] = useState('')
  const [ordineChiamata, setOrdineChiamata] = useState<any[]>([])
  const [indiceChiamata, setIndiceChiamata] = useState(1)
  const [squadreMap, setSquadreMap] = useState<Record<string, string>>({})

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchAsta = async () => {
    // Niente `maybeSingle()`: manda `Accept: application/vnd.pgrst.object+json`,
    // e con quell'intestazione PostgREST può rispondere con uno stato che il
    // client tratta da errore. Con `limit(1)` e il primo elemento la risposta è
    // un normale array e quel caso non esiste.
    const { data: righeAsta, error: erroreAsta } = await supabase
      .from('aste')
      // `squadre!squadra_in_testa`: da quando esiste massimi_asta, che ha una
      // chiave verso `aste` e una verso `squadre`, PostgREST vede due percorsi
      // fra le due tabelle e rifiuta l'incorporamento ambiguo con un 300.
      // Nominare la chiave toglie l'ambiguita'.
      .select('*, giocatori(*), squadre!squadra_in_testa(*)')
      .in('stato', ['IN_CORSO', 'CHIAMATA'])
      .order('created_at', { ascending: false })
      .limit(1)

    // L'errore veniva scartato: una lettura fallita diventava indistinguibile
    // da "nessuna asta in corso", cioè una schermata plausibile e falsa. Si
    // tiene l'ultimo stato buono invece di azzerarlo.
    if (erroreAsta) {
      setError(`Impossibile leggere lo stato dell'asta: ${erroreAsta.message}`)
      return
    }

    const data = righeAsta?.[0] ?? null
    setAsta(data)

    let partData: any[] = []
    if (data) {
      const { data: pd } = await supabase
        .from('liste_aste')
        .select('squadra_id, squadre(nome)')
        .eq('giocatore_id', data.giocatore_id)
      partData = pd || []
      setPartecipanti(partData)
    } else {
      setPartecipanti([])
    }

    // Carica regole lega
    const { data: regole } = await supabase
      .from('regole_lega')
      .select('ordine_chiamata, indice_chiamata, slot_totali')
      .limit(1)
      .maybeSingle()
    if (regole) {
      setOrdineChiamata(regole.ordine_chiamata || [])
      setIndiceChiamata(regole.indice_chiamata || 1)
    }

    // Quali squadre devono ancora chiamare qualcuno.
    //
    // Stesso criterio di avanza_turno_chiamata(): rosa non ancora completa E
    // almeno un giocatore ancora libero nella propria lista. Senza questo la
    // barra continuava a mostrare squadre che il turno ormai saltava sempre.
    const slotTotali = regole?.slot_totali ?? 30

    const { data: squadreDati } = await supabase.from('squadre').select('id, slot_occupati')
    const { data: listeAperte } = await supabase
      .from('liste_aste')
      .select('squadra_id, giocatori!inner(stato)')
      .eq('giocatori.stato', 'LIBERO')

    const conChiamate = new Set((listeAperte ?? []).map((r: { squadra_id: string }) => r.squadra_id))
    const attive = new Set(
      (squadreDati ?? [])
        .filter((s) => (s.slot_occupati ?? 0) < slotTotali && conChiamate.has(s.id))
        .map((s) => s.id)
    )
    setSquadreAttive(attive)

    // Stesso criterio di `rosa_completa()` lato server.
    const mia = squadraId ? (squadreDati ?? []).find((s) => s.id === squadraId) : null
    setRosaPiena(Boolean(mia) && (mia!.slot_occupati ?? 0) >= slotTotali)

    if (squadraId && data) {
      const { data: pieno } = await supabase.rpc('ruolo_pieno', {
        p_squadra_id: squadraId,
        p_giocatore_id: data.giocatore_id,
      })
      setRuoloPieno(Boolean(pieno))
    } else {
      setRuoloPieno(false)
    }

    if (squadraId) {
      const { data: disp } = await supabase.rpc('portieri_disponibili', { p_squadra_id: squadraId })
      setPortieriDisponibili(disp ?? 0)
    }

    if (squadraId && data) {
      const { data: tetto } = await supabase
        .from('massimi_asta')
        .select('importo')
        .eq('asta_id', data.id)
        .maybeSingle()
      setMassimoAuto(tetto?.importo ?? null)
    } else {
      setMassimoAuto(null)
    }
  }

  const fetchLista = async () => {
    if (!squadraId) return
    const { data } = await supabase
      .from('liste_aste')
      .select('*, giocatori(*)')
      .eq('squadra_id', squadraId)
    
    if (data) {
      const pendingList = data.filter((d: any) => d.giocatori?.stato === 'LIBERO')
      if (pendingList.length > 0) {
        const { data: allInvolved } = await supabase
          .from('liste_aste')
          .select('giocatore_id, squadre(nome)')
          .in('giocatore_id', pendingList.map((p: any) => p.giocatore_id))

        pendingList.forEach((p: any) => {
          p.contendenti = allInvolved
            ?.filter((a: any) => a.giocatore_id === p.giocatore_id && a.squadre?.nome)
            .map((a: any) => a.squadre.nome) || []
        })
      }
      setMiaLista(pendingList)
    }
  }

  useEffect(() => {
    fetchAsta()
    fetchLista()

    if (isAdmin) {
       supabase.from('squadre').select('*').order('nome').then(({data}) => {
         setSquadre(data || [])
         const sMap: Record<string, string> = {}
         data?.forEach((t: any) => sMap[t.id] = t.nome)
         setSquadreMap(sMap)
       })
    } else {
       supabase.from('squadre').select('id, nome').then(({data}) => {
         const sMap: Record<string, string> = {}
         data?.forEach((t: any) => sMap[t.id] = t.nome)
         setSquadreMap(sMap)
       })
    }

    // Nome di canale univoco: con un topic fisso due istanze montate insieme
    // (o il doppio mount di React StrictMode) collidono sullo stesso canale.
    const channel = supabase.channel(`realtime_aste-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aste' }, (payload) => {
         const nuovo = payload.new as { stato?: string } | null
         if (nuovo?.stato === 'IN_CORSO' || nuovo?.stato === 'CHIAMATA') {
           fetchAsta()
         } else {
           setAsta(null)
           fetchLista()
         }
      })
      // liste_aste non era osservata: la propria lista e i contendenti
      // restavano fermi finché non cambiava una riga di `aste`.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liste_aste' }, () => {
        fetchLista()
        fetchAsta()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'regole_lega' }, (payload) => {
        const nuovo = payload.new as { ordine_chiamata?: string[]; indice_chiamata?: number }
        setOrdineChiamata(nuovo.ordine_chiamata || [])
        setIndiceChiamata(nuovo.indice_chiamata || 1)
      })
      .subscribe((stato, err) => {
        // Senza questa callback un canale rotto resta invisibile: Supabase può
        // riportare SUBSCRIBED e non consegnare nulla, per esempio quando un
        // binding punta a una tabella fuori dalla publication realtime.
        //
        // CLOSED non è un guasto: è lo stato normale alla chiusura del canale,
        // cioè a ogni smontaggio del componente e al doppio mount di StrictMode.
        if (stato === 'CHANNEL_ERROR' || stato === 'TIMED_OUT') {
          console.warn('[TabelloneAsta] canale realtime in stato', stato, err)
          setRealtimeKo(true)
        } else if (stato === 'SUBSCRIBED') {
          setRealtimeKo(false)
        }
      })

    // Rete di sicurezza: se per qualsiasi motivo il realtime non consegna,
    // l'asta viene comunque riallineata ogni 15 secondi.
    const salvagente = setInterval(() => { void fetchAsta() }, 15000)

    return () => {
      clearInterval(salvagente)
      supabase.removeChannel(channel)
    }
  }, [squadraId, isAdmin])

  // Ridotto a un booleano: `partecipanti` cambiava identità a ogni fetch, e
  // avendolo nelle dipendenze l'intervallo veniva distrutto e ricreato a ogni
  // evento realtime, facendo saltare il conto alla rovescia.
  const isSoloLeft = useMemo(() => {
    const abbandoni = elencoAbbandoni(asta?.abbandoni)
    const attivi = partecipanti.filter((p) => !abbandoni.includes(p.squadra_id)).length
    return attivi <= 1 && partecipanti.length > 1
  }, [partecipanti, asta?.abbandoni])

  const scadenza = asta?.scadenza_corrente ?? null
  const statoAsta = asta?.stato ?? null
  const mioNomeSquadra = squadraId ? squadreMap[squadraId] : undefined
  const giocatoreInAsta: number | null = asta?.giocatore_id ?? null

  useEffect(() => {
    let annullato = false
    const leggi = async (squadra: string | null, imposta: (v: number | null) => void) => {
      if (!squadra || giocatoreInAsta === null) { imposta(null); return }
      const { data, error } = await supabase.rpc('calcola_massimo_offribile', {
        p_squadra_id: squadra,
        p_giocatore_in_asta_id: giocatoreInAsta,
      })
      if (!annullato) imposta(error ? null : (data as number))
    }
    void leggi(squadraId, setMassimoOffribile)
    void leggi(squadraDelegaId || null, setMassimoDelega)
    return () => { annullato = true }
    // Si rilegge a ogni cambio di prezzo: vincere o perdere un'asta altrove
    // sposta il massimo, perché cambiano slot liberi e giocatori in lista.
  }, [squadraId, squadraDelegaId, giocatoreInAsta, asta?.prezzo_corrente, supabase])

  // Su telefono la barra dei turni scorre in orizzontale: con quattordici
  // squadre quella di turno finisce facilmente fuori campo, e la domanda "a chi
  // tocca?" resta senza risposta finché non si trascina. La si porta in vista
  // da sé a ogni avanzamento.
  const turnoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    turnoRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [indiceChiamata, ordineChiamata])

  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (isSoloLeft || statoAsta !== 'IN_CORSO' || !scadenza) {
      // Anche l'azzeramento passa da una callback: leggere l'orologio o
      // scrivere stato in modo sincrono nel corpo dell'effect è ciò che
      // provoca i render a cascata.
      const azzera = setTimeout(() => setTimeLeft(0), 0)
      return () => clearTimeout(azzera)
    }

    const aggiorna = () => {
      const remaining = Math.floor((new Date(scadenza).getTime() - Date.now()) / 1000)
      setTimeLeft(remaining > 0 ? remaining : 0)
    }

    // Primo aggiornamento immediato ma asincrono, per non mostrare un valore
    // stantìo per un secondo.
    const primo = setTimeout(aggiorna, 0)
    intervalRef.current = setInterval(aggiorna, 1000)

    return () => {
      clearTimeout(primo)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [scadenza, statoAsta, isSoloLeft])

  // Dopo un'azione propria si rilegge sempre lo stato invece di attendere
  // l'evento realtime: chi ha appena cliccato deve vedere l'effetto subito.
  const prenotaChiamata = async (giocatoreId: number) => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('prenota_chiamata', { p_giocatore_id: giocatoreId })
    if (error) setError(error.message)
    else await fetchAsta()
    setLoading(false)
  }

  const impostaMassimo = async (delega?: string) => {
    if (!asta) return
    const valore = parseInt(campoMassimo, 10)
    if (Number.isNaN(valore)) { setError('Inserisci un importo.'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('imposta_massimo_asta', {
      p_asta_id: asta.id,
      p_importo: valore,
      ...(delega ? { p_squadra_delega: delega } : {}),
    })
    if (error) setError(error.message)
    else { setCampoMassimo(''); await fetchAsta() }
    setLoading(false)
  }

  const rimuoviMassimo = async (delega?: string) => {
    if (!asta) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('rimuovi_massimo_asta', {
      p_asta_id: asta.id,
      ...(delega ? { p_squadra_delega: delega } : {}),
    })
    if (error) setError(error.message)
    else await fetchAsta()
    setLoading(false)
  }

  const avviaTimer = async () => {
    if (!asta) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('avvia_timer_chiamata', { p_asta_id: asta.id })
    if (error) setError(error.message)
    else await fetchAsta()
    setLoading(false)
  }

  const chiudiAsta = async () => {
    if (!asta) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('chiudi_asta', { p_asta_id: asta.id })
    if (error) setError(error.message)
    else { await fetchAsta(); await fetchLista() }
    setLoading(false)
  }

  const rilancia = async (importo: number, delegaId?: string) => {
    // Un admin che rilancia in delega non ha bisogno di una propria squadra.
    if (!asta || (!squadraId && !delegaId)) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.rpc('piazza_offerta_asta', {
      p_asta_id: asta.id as string,
      p_importo: importo,
      p_squadra_delega: delegaId || undefined,
    })

    if (!error) await fetchAsta()
    setLoading(false)
    if (error) setError(error.message)
  }

  const abbandona = async (delegaId?: string) => {
    if (!asta) return
    setLoading(true)
    setError(null)
    
    try {
      const params: any = { p_asta_id: asta.id }
      if (delegaId) {
        params.p_squadra_delega = delegaId
      }
      const { error: err } = await supabase.rpc('abbandona_asta', params)
      if (err) throw err
      
      await fetchAsta()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isMioTurno = !isAdmin && squadraId && ordineChiamata.length > 0 && ordineChiamata[indiceChiamata - 1] === squadraId;

  if (!asta) {
    return (
      <div className="flex flex-col gap-6">
        {/* HEADER ORDINE CHIAMATA */}
        {ordineChiamata.length > 0 && (() => {
          // Si mostrano solo le squadre che devono ancora chiamare. Quella di
          // turno resta sempre visibile, per non lasciare la barra senza
          // riferimento durante l'attimo in cui il turno sta avanzando.
          const daChiamare = ordineChiamata.filter(
            (sqId, idx) => squadreAttive.has(sqId) || (idx + 1) === indiceChiamata
          )
          const concluse = ordineChiamata.length - daChiamare.length

          // La domanda vera è "a chi tocca, e quanto manca a me": leggerla dal
          // colore di una pillola in una fila che scorre non funziona, tanto
          // meno su un telefono. Qui si risponde a parole.
          const sqTurno = ordineChiamata[indiceChiamata - 1]
          const nomeTurno = squadreMap[sqTurno] || 'Squadra'
          const mioPosto = daChiamare.indexOf(squadraId ?? '')
          const turnoCorrente = daChiamare.indexOf(sqTurno)
          const turniMancanti = mioPosto >= 0 && turnoCorrente >= 0 ? mioPosto - turnoCorrente : -1

          return (
            <div className="fm-panel overflow-hidden">
              <div className="fm-panel-head">
                <span>Ordine di chiamata</span>
                {concluse > 0 && (
                  <span className="fm-label normal-case tracking-normal">
                    {concluse} {concluse === 1 ? 'squadra ha' : 'squadre hanno'} completato
                  </span>
                )}
              </div>

              {/* La riga che risponde alla domanda, prima delle pillole. */}
              <div
                className={`flex items-baseline justify-between gap-3 border-b px-3 py-2.5 ${
                  isMioTurno ? 'border-neon/40 bg-neon/10' : 'border-line bg-panel-hi'
                }`}
              >
                <span className={`fm-title text-base ${isMioTurno ? 'text-neon' : 'text-ink'}`}>
                  {isMioTurno ? 'Tocca a te' : `Tocca a ${nomeTurno}`}
                </span>
                {!isMioTurno && turniMancanti > 0 && (
                  <span className="fm-label shrink-0 normal-case tracking-normal">
                    {turniMancanti === 1 ? 'sei il prossimo' : `mancano ${turniMancanti} turni`}
                  </span>
                )}
              </div>
              {/* Su schermo stretto la barra scorre invece di andare a capo:
                  con 14 squadre, andando a capo si mangiava mezzo schermo. */}
              <div className="flex gap-2 overflow-x-auto px-3 py-2.5 md:flex-wrap md:overflow-visible">
                {daChiamare.map((sqId) => {
                  const posizione = ordineChiamata.indexOf(sqId) + 1
                  const isTurno = posizione === indiceChiamata
                  const isMe = sqId === squadraId
                  return (
                    <div
                      key={sqId}
                      ref={isTurno ? turnoRef : undefined}
                      /* Niente scale: ingrandendo la pillola di turno finiva
                         sopra a quella accanto. L'anello invece non occupa
                         spazio nel flusso, quindi non spinge le vicine. */
                      className={`fm-chip shrink-0 ${
                        isTurno
                          ? 'fm-chip-attivo ring-2 ring-neon ring-offset-2 ring-offset-panel'
                          : isMe
                            ? 'fm-chip-mia'
                            : 'opacity-60'
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                        isTurno ? 'bg-void text-neon' : 'bg-panel-hover text-ink-dim'
                      }`}>
                        {posizione}
                      </span>
                      {squadreMap[sqId] || 'Squadra'}{isMe && ' (Tu)'}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <div className="fm-panel flex flex-col items-center justify-center p-10 text-center">
          <h2 className="fm-title text-xl text-ink-mid">Nessuna asta in corso</h2>
          <p className="mt-2 text-sm text-ink-dim">
            {isMioTurno ? 'È il tuo turno: scegli un giocatore da chiamare.' : 'Attendi il tuo turno per chiamare.'}
          </p>
        </div>

        {realtimeKo && (
          <div className="fm-alert fm-alert-warn font-semibold">
            Aggiornamenti in tempo reale non disponibili: la pagina si allinea da sola ogni 15 secondi.
          </div>
        )}
        {error && <div className="fm-alert fm-alert-danger font-semibold">{error}</div>}

        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head fm-panel-head--neon">
            <span>La tua busta · Lista chiamate</span>
            <span className="fm-label">{miaLista.length}</span>
          </div>
          {miaLista.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-dim">Nessun giocatore libero nella tua lista.</div>
          ) : (
            <div className="divide-y divide-line">
              {miaLista.map((item) => {
                // Prima si filtrava su `item.squadre?.nome`, che fetchLista non
                // seleziona mai: la propria squadra restava fra i contendenti.
                const contendenti: string[] = (item.contendenti ?? []).filter((c: string) => c !== mioNomeSquadra)
                // `prenota_chiamata` ha gli stessi controlli su rosa completa e
                // reparto saturo: qui si anticipano, per non far scoprire il
                // rifiuto solo dopo aver premuto.
                const portiereDiTroppo = item.giocatori.ruolo === 'P' && portieriDisponibili <= 0
                const bloccato = loading || rosaPiena || portiereDiTroppo || (!isAdmin && !isMioTurno)
                return (
                <div key={item.id} className="flex flex-col gap-3 p-3 transition hover:bg-panel-hover sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="fm-nome text-lg text-ink">{item.giocatori.nome}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-mid">
                      <span>
                        {item.giocatori.ruolo} · {item.giocatori.squadra}
                        {item.giocatori.eta ? ` · ${item.giocatori.eta}` : ''}
                      </span>
                      {item.giocatori.ruolo_mantra && item.giocatori.ruolo_mantra.length > 0 && <MantraBadge ruoli={item.giocatori.ruolo_mantra} />}
                      <span className="fm-badge fm-badge-low">Base {item.giocatori.quotazione}</span>
                    </div>
                    {contendenti.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="fm-label mr-0.5">Conteso da</span>
                        {contendenti.map((nome) => (
                          <span key={nome} className="fm-chip">{nome}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2">
                        <span className="fm-chip fm-chip-neon">✓ Nessun contendente</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => prenotaChiamata(item.giocatore_id)}
                    /* `!!asta` era sempre falso qui: questo blocco viene reso solo
                       quando non c'è alcuna asta in corso. */
                    disabled={bloccato}
                    className="fm-btn fm-btn-primary w-full shrink-0 sm:w-auto"
                  >
                    {rosaPiena
                      ? 'Rosa completa'
                      : portiereDiTroppo
                        ? 'Portieri al completo'
                        : !isAdmin && !isMioTurno
                          ? 'Non è il tuo turno'
                          : 'Chiama'}
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  const isWinning = asta.squadra_in_testa === squadraId
  const isDelegaWinning = squadraDelegaId && asta.squadra_in_testa === squadraDelegaId
  const isChiamata = asta.stato === 'CHIAMATA'
  
  const hasAbbandonato = squadraId !== null && elencoAbbandoni(asta.abbandoni).includes(squadraId)
  const hasDelegaAbbandonato = Boolean(squadraDelegaId) && elencoAbbandoni(asta.abbandoni).includes(squadraDelegaId)
  const isParticipant = partecipanti.some(p => p.squadra_id === squadraId)

  // Offerta minima ammessa, secondo la stessa regola che applica il server in
  // `piazza_offerta_asta`: finché nessuno è in testa si può prendere il
  // giocatore ESATTAMENTE alla base d'asta; da lì in poi bisogna superare il
  // prezzo corrente.
  //
  // Il campo libero imponeva sempre `prezzo_corrente + 1`, quindi su un'asta
  // avviata dall'admin (che parte senza nessuno in testa) l'acquisto alla base
  // era impossibile dall'interfaccia pur essendo legittimo lato server.
  const senzaOfferte = !asta.squadra_in_testa
  const offertaMinima = senzaOfferte ? asta.base_asta : asta.prezzo_corrente + 1

  // Un unico posto in cui si decide se si può rilanciare, e soprattutto
  // PERCHÉ no: prima i comandi si disabilitavano in silenzio, e chi guardava
  // non aveva modo di capire cosa mancasse.
  const nonPuoiRilanciare =
    rosaPiena ? 'La tua rosa è al completo: non puoi aggiudicarti altri giocatori.'
    : ruoloPieno ? 'Hai già il numero massimo di portieri.'
    : !isParticipant ? 'Non sei fra i contendenti per questo giocatore.'
    : hasAbbandonato ? 'Ti sei ritirato da quest\'asta.'
    : isChiamata ? 'In attesa che l\'admin avvii il timer.'
    : isWinning ? 'Sei già in testa.'
    : massimoOffribile !== null && massimoOffribile < offertaMinima
      ? `Il tuo massimo (${massimoOffribile} cr) non arriva all'offerta minima.`
    : null

  const rilancioBloccato =
    loading || isWinning || isChiamata || hasAbbandonato || !isParticipant || rosaPiena || ruoloPieno

  // Il tetto si può dichiarare anche ad asta solo prenotata: scatterà quando
  // l'admin avvia il timer. `isChiamata` blocca i rilanci, non questo.
  const massimoBloccato = loading || hasAbbandonato || !isParticipant || rosaPiena || ruoloPieno
  // Superato: il prezzo ha raggiunto il tetto e non siamo più in testa. È lo
  // stato che va gridato, non sussurrato: chi si crede protetto e non lo è più
  // deve accorgersene subito.
  const tettoSuperato = massimoAuto !== null && !isWinning && asta !== null && asta.prezzo_corrente >= massimoAuto

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
         <div className="fm-panel flex flex-wrap items-center justify-between gap-3 border-rosso/50 p-3">
           <div className="fm-title flex items-center gap-2 text-base text-rosso">
             <span>🔴</span> Super-regia
           </div>
           <div className="flex gap-2">
             {isChiamata && (
               <button onClick={avviaTimer} disabled={loading} className="fm-btn fm-btn-primary">
                 ▶️ Avvia timer
               </button>
             )}
             {!isChiamata && (
               <button onClick={chiudiAsta} disabled={loading} className="fm-btn fm-btn-danger">
                 ⏹️ Chiudi asta e assegna
               </button>
             )}
           </div>
         </div>
      )}

      <div className="fm-panel mx-auto w-full max-w-4xl overflow-hidden">
        {/* Spaziatura ridotta sotto sm: su uno schermo da 5" ogni riga tolta
            qui è una riga guadagnata in fondo, dove stanno i partecipanti. */}
        <div className="relative border-b border-line-hi bg-panel-hi px-3 py-3 text-center sm:px-4 sm:py-4">
          <h2 className="fm-title text-2xl sm:text-3xl">{asta.giocatori.nome}</h2>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-sm text-ink-mid">
            <span>{asta.giocatori.ruolo}</span>
            <span className="text-ink-dim">&bull;</span>
            <span>{asta.giocatori.squadra}</span>
            {asta.giocatori.eta && (
              <>
                <span className="text-ink-dim">&bull;</span>
                <span>{asta.giocatori.eta}</span>
              </>
            )}
            {asta.giocatori.ruolo_mantra && asta.giocatori.ruolo_mantra.length > 0 && (
              <>
                <span className="text-ink-dim">&bull;</span>
                <MantraBadge ruoli={asta.giocatori.ruolo_mantra} />
              </>
            )}
          </div>
          {isChiamata && (
            <div className="fm-chip fm-chip-ambra absolute right-3 top-3 uppercase">
              Prenotato
            </div>
          )}
        </div>

        <div className="p-3 sm:p-6">
          {/* Due blocchi affiancati, non tre celle di una griglia unica.
              Con la griglia a tre colonne i comandi — alti il triplo — tiravano
              in lungo l'intera riga: su desktop il bordo del tempo correva per
              mezzo schermo nel vuoto e la fascia "In testa" finiva lontanissima
              dal prezzo a cui si riferisce. Qui l'altezza dei comandi non
              contagia più i numeri (`items-start`), e la fascia resta attaccata
              a ciò che descrive. */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">

            {/* A sinistra ciò che si guarda: i due numeri e chi è in testa. */}
            <div className="flex min-w-0 flex-col gap-3 md:flex-1">

              {/* Prezzo e tempo affiancati anche sul telefono: sono i due
                  numeri che si leggono davvero, e impilati spingevano i
                  comandi di rilancio sotto la piega. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="fm-label">Offerta attuale</p>
                  <div className="mt-1 text-4xl font-bold tabular-nums text-ink sm:text-6xl">{asta.prezzo_corrente}</div>
                </div>

                <div className="border-l border-line pl-3 text-center">
                  <p className="fm-label">Tempo rimasto</p>
                  {isChiamata ? (
                     <div className="mt-3 text-base font-semibold leading-tight text-ink-dim sm:mt-5">
                       In attesa che l&apos;admin<br />avvii il timer…
                     </div>
                  ) : (
                     /* Prima qui c'era `animate-pulse`, che anima l'opacità da 1 a
                        0.5: per metà di ogni secondo il numero più importante della
                        schermata scendeva sotto soglia di contrasto. Ora lampeggia
                        il colore, non la trasparenza. */
                     <div className={`mt-1 text-5xl font-bold tabular-nums sm:text-7xl ${timeLeft <= 5 ? 'animate-battito text-rosso' : 'text-neon'}`}>
                       {timeLeft}
                     </div>
                  )}
                </div>
              </div>

              {/* Chi è in testa: una fascia a tutta larghezza, non più una
                  pillola sotto il prezzo. La pillola ha `white-space: nowrap` e
                  con un nome lungo sfondava la propria colonna finendo sopra il
                  timer; e soprattutto, spenta com'era, un rilancio passava
                  inosservato.

                  `key` sul prezzo: cambiando prezzo React rimonta il nodo e
                  l'animazione riparte da capo. È il modo più semplice di far
                  lampeggiare a ogni rilancio senza tenere in memoria il prezzo
                  precedente né toccare lo stato dentro un effetto. */}
              <div
                key={asta.prezzo_corrente}
                className={`flex animate-lampo items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-sm font-semibold ${
                  !asta.squadre
                    ? 'border-line bg-panel-hi text-ink-mid'
                    : isWinning
                      ? 'border-neon/50 bg-neon/10 text-neon'
                      : 'border-ambra/50 bg-ambra/10 text-ambra'
                }`}
              >
                {!asta.squadre ? (
                  <span>Nessuna offerta · si parte dalla base d&apos;asta</span>
                ) : (
                  <>
                    <span className="shrink-0">{isWinning ? '👑' : '⬆'}</span>
                    <span className="min-w-0 break-words">
                      {isWinning ? 'Sei in testa' : 'In testa'}
                      {!isWinning && <> · <strong>{asta.squadre.nome}</strong></>}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* A destra ciò che si tocca. Larghezza fissa su desktop: lasciata
                elastica, i pulsanti si stiravano fino a metà pannello. Sotto md
                torna a tutta larghezza, a portata di pollice. */}
            <div className="flex flex-col items-center gap-2 border-t border-line pt-3 sm:gap-2.5 md:w-72 md:shrink-0 md:border-l md:border-t-0 md:pl-6 md:pt-0">

              {/* "Il tuo massimo" sta qui e non sotto il prezzo: serve mentre si
                  decide quanto offrire, non mentre si guarda l'offerta altrui. */}
              {massimoOffribile !== null && (
                <div className="flex w-full items-baseline justify-center gap-2">
                  <span className="fm-label">Il tuo massimo</span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      massimoOffribile <= asta.prezzo_corrente ? 'text-rosso' : 'text-neon'
                    }`}
                  >
                    {massimoOffribile}<span className="text-xs font-normal text-ink-dim"> cr</span>
                  </span>
                  {massimoOffribile <= asta.prezzo_corrente && (
                    <span className="text-[11px] font-semibold text-rosso">fuori portata</span>
                  )}
                </div>
              )}

              <p className="fm-label w-full text-center">Rilancia</p>

              {error && <div className="fm-alert fm-alert-danger w-full text-center text-xs font-semibold">{error}</div>}

              <div className="flex w-full gap-2">
                 <button onClick={() => rilancia(offertaMinima)} disabled={rilancioBloccato} className="fm-btn fm-btn-primary flex-1">
                   {senzaOfferte ? `Base ${asta.base_asta}` : '+1'}
                 </button>
                 <button onClick={() => rilancia(asta.prezzo_corrente + 5)} disabled={rilancioBloccato} className="fm-btn fm-btn-primary flex-1">
                   +5
                 </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const val = parseInt(fd.get('custom') as string)
                if (!isNaN(val)) rilancia(val)
                e.currentTarget.reset()
              }} className="flex w-full gap-2">
                <input name="custom" type="number" min={offertaMinima} placeholder={`Min: ${offertaMinima}`} disabled={rilancioBloccato} className="fm-input flex-1" required />
                <button type="submit" disabled={rilancioBloccato} className="fm-btn fm-btn-ghost shrink-0">
                  Vai
                </button>
              </form>

              {nonPuoiRilanciare && (
                <p className="w-full text-center text-xs font-medium text-ink-dim">{nonPuoiRilanciare}</p>
              )}

              {/* ---- Massimo automatico ----
                  Il server risponde per conto di chi lo ha dichiarato, dentro
                  la stessa transazione del rilancio avversario: funziona anche
                  a pagina chiusa. */}
              {squadraId && (
                <div className="mt-2 w-full border-t border-line pt-3">
                  <p className="fm-label mb-1.5 text-center">Massimo automatico</p>

                  {massimoAuto !== null ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className={`fm-chip ${tettoSuperato ? 'fm-chip-rosso' : 'fm-chip-neon'}`}>
                        {massimoAuto} cr · {tettoSuperato ? 'superato' : 'attivo'}
                      </span>
                      <p className="text-center text-[11px] text-ink-dim">
                        {tettoSuperato
                          ? 'Il prezzo ha raggiunto il tuo massimo: da qui in poi decidi tu.'
                          : 'Rilancio da solo fino a questa cifra, anche a pagina chiusa.'}
                      </p>
                      <button
                        onClick={() => rimuoviMassimo()}
                        disabled={loading}
                        className="fm-btn fm-btn-ghost fm-btn-sm"
                      >
                        Rimuovi
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => { e.preventDefault(); void impostaMassimo() }}
                      className="flex w-full gap-2"
                    >
                      <input
                        type="number"
                        min={offertaMinima}
                        value={campoMassimo}
                        onChange={(e) => setCampoMassimo(e.target.value)}
                        placeholder="Fino a…"
                        disabled={massimoBloccato}
                        className="fm-input flex-1"
                        aria-label="Importo massimo automatico"
                        required
                      />
                      <button type="submit" disabled={massimoBloccato} className="fm-btn fm-btn-viola shrink-0">
                        Imposta
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

          </div>

          <div className="mt-4 border-t border-line pt-4 sm:mt-6 sm:pt-5">
            <h3 className="fm-label mb-3 text-center">👥 Partecipanti in gara</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {partecipanti.map((p) => {
                const haAbbandonato = elencoAbbandoni(asta.abbandoni).includes(p.squadra_id)
                const isWinner = asta.squadra_in_testa === p.squadra_id
                return (
                  /* Il ritirato usa un colore già smorzato invece di `opacity`:
                     con opacity-70 su text-gray-400 il contrasto crollava a ~2:1. */
                  <span key={p.squadra_id} className={`fm-chip ${
                    haAbbandonato
                      ? 'fm-chip-fuori'
                      : isWinner
                        ? 'fm-chip-neon'
                        : ''
                  }`}>
                    {haAbbandonato && '❌ '}
                    {isWinner && '👑 '}
                    {p.squadre.nome}
                  </span>
                )
              })}
            </div>
            
            {!isChiamata && isParticipant && !hasAbbandonato && asta.squadra_in_testa !== squadraId && (
              <div className="mt-5 flex justify-center">
                <button onClick={() => abbandona()} disabled={loading} className="fm-btn fm-btn-danger">
                  🛑 Smetti (mi ritiro)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PANNELLO DELEGA (Solo Admin) */}
        {isAdmin && !isChiamata && (
           <div className="border-t border-line-hi bg-panel-hi p-4">
             <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="fm-title text-sm text-ambra">🤝 Modalità delega (assenti)</h3>
                  <select
                    className="fm-select sm:max-w-xs"
                    value={squadraDelegaId}
                    onChange={(e) => setSquadraDelegaId(e.target.value)}
                    aria-label="Squadra per cui offrire in delega"
                  >
                    <option value="">— Nessuna delega attiva —</option>
                    {/* Solo le squadre effettivamente in gara per questo
                        giocatore: prima l'elenco comprendeva tutte, e si poteva
                        rilanciare o abbandonare per conto di chi non partecipa.
                        Se nessuno ha il giocatore in lista l'asta è aperta a
                        tutti, e allora si mostrano tutte le squadre. */}
                    {(partecipanti.length > 0
                      ? squadre.filter((s) => partecipanti.some((p) => p.squadra_id === s.id))
                      : squadre
                    )
                      .filter((s) => s.id !== squadraId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                  </select>
                </div>

                {squadraDelegaId && (
                  <>
                    {massimoDelega !== null && (
                      <div className="fm-alert fm-alert-warn text-sm font-semibold">
                        Massimo offribile di {squadre.find(s => s.id === squadraDelegaId)?.nome}:{' '}
                        <span className={massimoDelega <= asta.prezzo_corrente ? 'text-rosso' : 'text-neon'}>
                          {massimoDelega} cr
                        </span>
                        {massimoDelega <= asta.prezzo_corrente && ' — non può rilanciare'}
                      </div>
                    )}
                    <div className="flex w-full gap-2">
                      <button onClick={() => rilancia(offertaMinima, squadraDelegaId)} disabled={loading || isDelegaWinning || hasDelegaAbbandonato} className="fm-btn fm-btn-ghost flex-1">
                        {senzaOfferte ? `Base ${asta.base_asta}` : '+1'} delega
                      </button>
                      <button onClick={() => rilancia(asta.prezzo_corrente + 5, squadraDelegaId)} disabled={loading || isDelegaWinning || hasDelegaAbbandonato} className="fm-btn fm-btn-ghost flex-1">
                        +5 Delega
                      </button>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      const val = parseInt(fd.get('customDelega') as string)
                      if (!isNaN(val)) rilancia(val, squadraDelegaId)
                      e.currentTarget.reset()
                    }} className="flex w-full gap-2">
                      <input name="customDelega" type="number" min={offertaMinima} placeholder={`Min: ${offertaMinima}`} disabled={hasDelegaAbbandonato} className="fm-input flex-1" required />
                      <button type="submit" disabled={loading || isDelegaWinning || hasDelegaAbbandonato} className="fm-btn fm-btn-primary shrink-0">
                        Vai (delega)
                      </button>
                    </form>

                    {/* Massimo automatico per la squadra delegata.
                        Il valore attuale non si può mostrare: le RLS su
                        massimi_asta rendono i tetti leggibili solo al
                        proprietario, e l'admin qui e' anche un manager in
                        gara. Si puo' impostarne uno nuovo o toglierlo. */}
                    <div className="flex w-full flex-col gap-1.5 border-t border-line pt-3">
                      <span className="fm-label">Massimo automatico in delega</span>
                      <div className="flex w-full gap-2">
                        <input
                          type="number"
                          min={offertaMinima}
                          value={campoMassimo}
                          onChange={(e) => setCampoMassimo(e.target.value)}
                          placeholder="Fino a…"
                          disabled={loading || hasDelegaAbbandonato}
                          className="fm-input flex-1"
                          aria-label="Massimo automatico per la squadra delegata"
                        />
                        <button
                          onClick={() => impostaMassimo(squadraDelegaId)}
                          disabled={loading || hasDelegaAbbandonato}
                          className="fm-btn fm-btn-viola shrink-0"
                        >
                          Imposta
                        </button>
                        <button
                          onClick={() => rimuoviMassimo(squadraDelegaId)}
                          disabled={loading}
                          className="fm-btn fm-btn-ghost shrink-0"
                        >
                          Rimuovi
                        </button>
                      </div>
                      <span className="text-[11px] text-ink-dim">
                        Il tetto in corso non è visibile: per scelta lo vede solo la squadra che lo ha impostato.
                      </span>
                    </div>

                    {!hasDelegaAbbandonato && asta.squadra_in_testa !== squadraDelegaId && (
                      <div className="flex w-full justify-center pt-1">
                        <button onClick={() => abbandona(squadraDelegaId)} disabled={loading} className="fm-btn fm-btn-danger fm-btn-sm">
                          🛑 Smetti per conto di {squadre.find(s => s.id === squadraDelegaId)?.nome}
                        </button>
                      </div>
                    )}
                  </>
                )}
             </div>
           </div>
        )}

      </div>
    </div>
  )
}
