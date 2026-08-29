'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import RuoliGiocatore from '@/components/RuoliGiocatore'
import Conferma from '@/components/Conferma'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import { mantraPresenti } from '@/utils/ruoli'
import { passaFiltri } from '@/utils/filtri'
import PannelloFiltri from '@/components/PannelloFiltri'
import { ordinaGiocatori, OPZIONI_ORDINE, type ColonnaOrdine, type Verso } from '@/utils/ordinamento'
import { idsInCodaAsta } from '@/utils/giocatori'

type Squadra = {
  id: string
  nome: string
  crediti_residui: number
  slot_occupati: number
}

type Giocatore = {
  id: number
  nome: string
  ruolo: 'P' | 'D' | 'C' | 'A'
  squadra: string | null
  quotazione: number
  eta: number | null
  ruolo_mantra: string[] | null
}

type BustaConGiocatore = {
  id: string
  esito: 'ATTESA' | 'VINTO' | 'CONTESO' | 'PERSO'
  turno: number
  giocatori: Giocatore | null
}

/** Una busta vinta da chiunque: serve il nome della squadra, non solo il mio. */
type BustaVinta = BustaConGiocatore & { squadre: { nome: string } | null }

export default function BustePage() {
  const supabase = createClient()
  const router = useRouter()
  
  const [faseAperta, setFaseAperta] = useState(false)
  const [squadra, setSquadra] = useState<Squadra | null>(null)
  const [slotTotali, setSlotTotali] = useState(30)
  // Quanti portieri la squadra puo' ancora prendere. Si chiede al server
  // invece di ricalcolarlo qui: e' la stessa funzione che poi rifiuta il
  // salvataggio, quindi i due numeri non possono divergere.
  const [portieriDisponibili, setPortieriDisponibili] = useState(0)
  const [maxPortieri, setMaxPortieri] = useState(3)

  // Per fase aperta
  const [ricerca, setRicerca] = useState('')
  const [filtroRuolo, setFiltroRuolo] = useState('')
  // Gli stessi filtri di /svincolati: qui si compilano le buste guardando i
  // reparti scoperti e il budget, e mancavano proprio squadra ed eta'.
  const [filtroSquadra, setFiltroSquadra] = useState('')
  const [filtroEta, setFiltroEta] = useState('')
  const [colonna, setColonna] = useState<ColonnaOrdine>('nome')
  const [verso, setVerso] = useState<Verso>('asc')
  const [giocatoriLiberi, setGiocatoriLiberi] = useState<Giocatore[]>([])
  const [selezionati, setSelezionati] = useState<Giocatore[]>([])
  // Gli id che il server ha registrato, non quelli che si vedono a schermo:
  // servono a distinguere le due cose. `null` finché non si è letto.
  const [idsSalvati, setIdsSalvati] = useState<Set<number> | null>(null)

  // Per fase chiusa
  const [risultati, setRisultati] = useState<BustaConGiocatore[]>([])
  // Chi si e' preso un giocatore senza passare dall'asta, di TUTTE le squadre.
  // Visibile a fase aperta e chiusa: e' storia di turni gia' spogliati.
  const [sommario, setSommario] = useState<BustaVinta[]>([])

  const [loading, setLoading] = useState(true)
  // Al posto di `alert()`: erano le ultime finestre di sistema rimaste
  // nell'app, disegnate dal sistema operativo e fuori tema.
  const [avviso, setAvviso] = useState<{ tono: 'ok' | 'errore'; titolo: string; testo: string } | null>(null)

  useEffect(() => {
    loadData()

    const channelRegole = supabase.channel(`regole_lega_buste-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'regole_lega' },
        () => {
          loadData()
        }
      )
      .subscribe()

    const channelBuste = supabase.channel('buste_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'buste' },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channelRegole)
      supabase.removeChannel(channelBuste)
    }
  }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      // La home, non `/login`: è lì che vive l'unico modulo di accesso, quello
      // che accetta il solo nome utente. Tutte le pagine server fanno lo
      // stesso tramite `requireUtente()`.
      router.push('/')
      return
    }

    const { data: prof } = await supabase.from('profili').select('squadra_id').eq('id', userData.user.id).single()
    if (!prof?.squadra_id) {
      setLoading(false)
      return
    }

    const { data: sq } = await supabase.from('squadre').select('*').eq('id', prof.squadra_id).single()
    // Senza questo controllo, ogni `sq.id` più sotto lanciava se la query
    // falliva (per esempio per una policy RLS).
    if (!sq) {
      setLoading(false)
      return
    }
    setSquadra(sq as Squadra)

    const { data: rData } = await supabase
      .from('regole_lega')
      .select('fase_buste_aperta, slot_totali, slot_p')
      .limit(1)
      .maybeSingle()
    const aperta = rData?.fase_buste_aperta || false
    setSlotTotali(rData?.slot_totali ?? 30)
    setMaxPortieri(rData?.slot_p ?? 3)
    setFaseAperta(aperta)

    const { data: pDisp } = await supabase.rpc('portieri_disponibili', { p_squadra_id: sq.id })
    setPortieriDisponibili(pDisp ?? 0)

    if (aperta) {
      // Carica i liberi, escludendo chi è fuori lista
      const { data: tuttiLiberi } = await supabase
        .from('giocatori')
        .select('*')
        .eq('stato', 'LIBERO')
        .eq('fuori_lista', false)
        .order('nome')

      // Via anche chi è già in coda per l'asta. Qui non è una questione di
      // ordine: un conteso resta 'LIBERO' finché la sua asta non chiude, e
      // mettendoci sopra una busta in un turno successivo da richiedente unico
      // se lo sarebbe aggiudicato alla quotazione, saltando l'asta che gli
      // altri contendenti stavano aspettando. `submit_buste` ora lo rifiuta:
      // questa riga serve a non far scoprire il rifiuto solo dopo aver premuto.
      const inCoda = await idsInCodaAsta(supabase)
      const liberi = ((tuttiLiberi as Giocatore[]) || []).filter((g) => !inCoda.has(g.id))
      setGiocatoriLiberi(liberi)

      // Carica eventuali selezioni salvate in precedenza e non ancora elaborate
      const { data: busteInAttesa } = await supabase
        .from('buste')
        .select('giocatore_id')
        .eq('squadra_id', sq.id)
        .eq('esito', 'ATTESA')

      // Si tiene da parte ciò che il server ha davvero registrato: è l'unico
      // modo di dire se quello che si vede a schermo è già al sicuro.
      const idsAttesa = new Set<number>((busteInAttesa ?? []).map((b) => b.giocatore_id))
      setIdsSalvati(idsAttesa)

      if (idsAttesa.size > 0) {
        setSelezionati(liberi.filter((g) => idsAttesa.has(g.id)))
      }

    } else {
      // Carica le buste elaborate e non
      const { data: storico } = await supabase
        .from('buste')
        .select('*, giocatori(*)')
        .eq('squadra_id', sq.id)
        .order('created_at', { ascending: false })
      setRisultati((storico as unknown as BustaConGiocatore[]) || [])
    }

    // Il sommario si carica in entrambe le fasi: sono esiti di turni già
    // spogliati, quindi non svelano niente di quello in corso. La policy
    // `lettura_buste` li rende leggibili a tutti; le buste ancora in ATTESA
    // restano visibili solo a chi le ha scritte.
    const { data: vinte } = await supabase
      .from('buste')
      .select('*, giocatori(*), squadre(nome)')
      .eq('esito', 'VINTO')
      .order('turno', { ascending: false })
    setSommario((vinte as unknown as BustaVinta[]) || [])

    setLoading(false)
  }

  // Ricerca su nome, ruolo classico e ruoli Mantra. Si mostrano tutti i
  // risultati: la lista scorre nel suo contenitore.
  // Risultati raggruppati per turno, dal più recente.
  const perTurno = useMemo(() => {
    const gruppi = new Map<number, BustaConGiocatore[]>()
    for (const r of risultati) {
      const t = r.turno ?? 1
      if (!gruppi.has(t)) gruppi.set(t, [])
      gruppi.get(t)!.push(r)
    }
    return [...gruppi.entries()].sort((a, b) => b[0] - a[0])
  }, [risultati])

  // Il sommario, raggruppato per turno come i propri esiti: sono le stesse
  // tornate, guardate da fuori invece che dalla propria squadra.
  const sommarioPerTurno = useMemo(() => {
    const gruppi = new Map<number, BustaVinta[]>()
    for (const b of sommario) {
      const t = b.turno ?? 1
      if (!gruppi.has(t)) gruppi.set(t, [])
      gruppi.get(t)!.push(b)
    }
    for (const righe of gruppi.values()) {
      righe.sort((a, b) => (a.squadre?.nome ?? '').localeCompare(b.squadre?.nome ?? '', 'it')
        || (a.giocatori?.nome ?? '').localeCompare(b.giocatori?.nome ?? '', 'it'))
    }
    return [...gruppi.entries()].sort((a, b) => b[0] - a[0])
  }, [sommario])

  const ruoliMantra = useMemo(() => mantraPresenti(giocatoriLiberi), [giocatoriLiberi])

  // Le squadre di Serie A presenti fra i liberi: l'elenco si accorcia da solo
  // man mano che i giocatori vengono assegnati.
  const squadreUniche = useMemo(
    () => [...new Set(giocatoriLiberi.map((g) => g.squadra).filter(Boolean))].sort() as string[],
    [giocatoriLiberi])

  const liberiFiltrati = useMemo(() => {
    const filtrati = giocatoriLiberi.filter((g) => {
      const matchSquadra = filtroSquadra === '' || g.squadra === filtroSquadra
      const matchEta = filtroEta === '' || (g.eta !== null && g.eta <= parseInt(filtroEta))
      return passaFiltri(g, ricerca, filtroRuolo) && matchSquadra && matchEta
    })
    return ordinaGiocatori(filtrati, colonna, verso)
  }, [giocatoriLiberi, ricerca, filtroRuolo, filtroSquadra, filtroEta, colonna, verso])

  // L'ordinamento non conta fra i filtri attivi: non nasconde nessuna riga.
  const filtriAttivi =
    (filtroRuolo ? 1 : 0) + (filtroSquadra ? 1 : 0) + (filtroEta ? 1 : 0)

  const azzeraFiltri = () => {
    setFiltroRuolo('')
    setFiltroSquadra('')
    setFiltroEta('')
  }

  const toggleSelezionato = (giocatore: Giocatore) => {
    if (selezionati.find(s => s.id === giocatore.id)) {
      setSelezionati(selezionati.filter(s => s.id !== giocatore.id))
    } else {
      setSelezionati([...selezionati, giocatore])
    }
  }

  const submitBuste = async () => {
    if (!squadra) return
    const slotLiberi = slotTotali - squadra.slot_occupati
    if (selezionati.length !== slotLiberi) {
      setAvviso({
        tono: 'errore',
        titolo: 'Selezione incompleta',
        testo: `Devi selezionare esattamente ${slotLiberi} giocatori: adesso ne hai ${selezionati.length}.`,
      })
      return
    }

    const costoTotale = selezionati.reduce((sum, g) => sum + g.quotazione, 0)
    if (costoTotale > squadra.crediti_residui) {
      setAvviso({
        tono: 'errore',
        titolo: 'Budget superato',
        testo: `Il costo totale è ${costoTotale} cr, ma hai ${squadra.crediti_residui} cr disponibili.`,
      })
      return
    }

    const ids = selezionati.map(g => g.id)
    const { error } = await supabase.rpc('submit_buste', { p_giocatori_ids: ids })

    if (error) {
      setAvviso({ tono: 'errore', titolo: 'Salvataggio non riuscito', testo: error.message })
    } else {
      setAvviso({
        tono: 'ok',
        titolo: 'Lista salvata',
        testo: `Le tue ${selezionati.length} selezioni sono state registrate. Puoi modificarle finché la fase buste resta aperta.`,
      })
      loadData()
    }
  }

  if (loading) return <div className="p-12 text-center text-ink-mid">Caricamento…</div>
  if (!squadra) return <div className="p-12 text-center text-ink-mid">Nessuna squadra associata.</div>

  const slotLiberi = slotTotali - squadra.slot_occupati
  const costoTotale = selezionati.reduce((sum, g) => sum + g.quotazione, 0)
  const portieriScelti = selezionati.filter(g => g.ruolo === 'P').length
  const portieriResidui = portieriDisponibili - portieriScelti
  const isValida =
    selezionati.length === slotLiberi &&
    costoTotale <= squadra.crediti_residui &&
    portieriResidui >= 0

  // Confronto fra INSIEMI, non fra lunghezze: togliere un giocatore e
  // aggiungerne un altro lascia il conto identico e la lista diversa, che è
  // proprio il caso in cui dire "salvate" sarebbe una bugia.
  const salvata =
    idsSalvati !== null &&
    idsSalvati.size === selezionati.length &&
    selezionati.every((g) => idsSalvati.has(g.id))

  // Tre stati e non due: a lista mai compilata "salvate" sarebbe vero per
  // vacuità — due insiemi vuoti sono uguali — e leggerlo su una pagina appena
  // aperta darebbe l'idea di essere a posto senza aver fatto niente.
  const statoBuste: 'mai' | 'salvate' | 'modificate' =
    idsSalvati !== null && idsSalvati.size === 0 && selezionati.length === 0
      ? 'mai'
      : salvata
        ? 'salvate'
        : 'modificate'

  return (
    <div className="mx-auto w-full max-w-7xl p-3 sm:p-6 md:p-8">
      <h1 className="fm-title mb-5 text-2xl sm:text-3xl">Mercato di riparazione · Buste</h1>

      {!faseAperta ? (
        <div className="space-y-5">
          <div className="fm-alert fm-alert-danger">
            <h2 className="fm-title text-base">La fase buste è chiusa</h2>
            <p className="mt-1 text-sm">L&apos;inserimento delle liste non è al momento consentito.</p>
          </div>

          <div className="fm-panel overflow-hidden">
            <div className="fm-panel-head">
              <span>I tuoi risultati</span>
              {risultati.length > 0 && <span className="fm-label">{risultati.length}</span>}
            </div>
            <div className="fm-panel-body">
            {risultati.length === 0 ? (
              <p className="text-sm text-ink-dim">Non hai effettuato scelte o non ci sono risultati.</p>
            ) : (
              perTurno.map(([turno, righe]) => (
              <div key={turno} className="mb-6 last:mb-0">
                {/* Un'intestazione per turno: senza, gli esiti di tornate
                    diverse si mescolavano senza modo di distinguerli. */}
                {perTurno.length > 1 && (
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="fm-chip fm-chip-attivo">Turno {turno}</span>
                    <div className="flex-1 border-t border-line" />
                  </div>
                )}
              <div className="grid gap-2">
                {righe.map(r => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-md border border-line bg-panel-hi p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {/* Optional chaining: una busta orfana faceva crashare l'intera pagina */}
                      <div className="fm-nome text-base">{r.giocatori?.nome ?? 'Giocatore rimosso'}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-mid">
                        <span>{r.giocatori?.squadra}{r.giocatori?.eta ? ` · ${r.giocatori.eta}` : ''}</span>
                        <RuoliGiocatore ruolo={r.giocatori?.ruolo} ruoloMantra={r.giocatori?.ruolo_mantra} />
                      </div>
                    </div>
                    <div className="shrink-0">
                      {r.esito === 'VINTO' && <span className="fm-chip fm-chip-neon">✅ Preso a {r.giocatori?.quotazione} cr</span>}
                      {r.esito === 'CONTESO' && <span className="fm-chip fm-chip-ambra">⚔️ Spareggio live</span>}
                      {r.esito === 'PERSO' && <span className="fm-chip fm-chip-rosso">❌ Non assegnato</span>}
                      {r.esito === 'ATTESA' && <span className="fm-chip">⏳ In attesa</span>}
                    </div>
                  </div>
                ))}
              </div>
              </div>
              ))
            )}
            </div>
          </div>
        </div>
      ) : slotLiberi <= 0 ? (
        <div className="fm-alert fm-alert-warn">
          <h2 className="fm-title text-base">Rosa al completo</h2>
          <p className="mt-1 text-sm">La tua squadra non ha slot liberi. Non puoi partecipare a questa fase di mercato.</p>
        </div>
      ) : (
        /* Griglia e non flex: con `w-2/3` + `w-1/3` + `gap-4` la somma supera
           il 100%, quindi le due colonne devono restringersi, e nessuna può
           scendere sotto la larghezza minima del proprio contenuto. Bastava
           aggiungere un nome ai selezionati per spostare la colonna di
           sinistra. Le tracce della griglia non dipendono dal contenuto, e
           `min-w-0` toglie anche il minimo automatico. */
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Colonna Ricerca */}
          <div className="fm-panel min-w-0 p-3 sm:p-4 lg:col-span-2">
            {/* Due colonne e non quattro: questo pannello vive dentro i due
                terzi di sinistra della pagina, e a quattro colonne le tendine
                si stringerebbero fino a tagliare i nomi delle squadre. */}
            <PannelloFiltri
              attivi={filtriAttivi}
              onAzzera={azzeraFiltri}
              griglia="sm:grid-cols-2"
              ricerca={
                <input
                  type="text"
                  placeholder="Cerca calciatore o squadra…"
                  /* `focus:ring-0` azzerava l'anello di focus proprio sul
                     comando principale della pagina. */
                  className="fm-input"
                  value={ricerca}
                  onChange={e => setRicerca(e.target.value)}
                  aria-label="Cerca calciatore o squadra"
                />
              }
            >
              <div>
                {/* Prima era un elenco fatto a mano di P/D/C/A, e i ruoli Mantra
                    non si potevano filtrare: qui si compilano le buste guardando
                    i reparti scoperti, ed era proprio la pagina in cui servivano
                    di più. */}
                <label htmlFor="b-ruolo" className="fm-label mb-1 block">Ruolo</label>
                <select
                  id="b-ruolo"
                  className="fm-select"
                  value={filtroRuolo}
                  onChange={e => setFiltroRuolo(e.target.value)}
                >
                  <OpzioniRuolo presenti={ruoliMantra} />
                </select>
              </div>
              <div>
                <label htmlFor="b-squadra" className="fm-label mb-1 block">Squadra</label>
                <select
                  id="b-squadra"
                  className="fm-select"
                  value={filtroSquadra}
                  onChange={e => setFiltroSquadra(e.target.value)}
                >
                  <option value="">Tutte le squadre</option>
                  {squadreUniche.map((sq) => (
                    <option key={sq} value={sq}>{sq}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="b-eta" className="fm-label mb-1 block">Età (under max)</label>
                <input
                  id="b-eta"
                  type="number"
                  placeholder="Es. 21"
                  className="fm-input"
                  value={filtroEta}
                  onChange={e => setFiltroEta(e.target.value)}
                />
              </div>
              <div>
                {/* Qui la tendina serve su ogni schermo, non solo sul telefono:
                    l'elenco è fatto di schede e non ha intestazioni di colonna
                    da cliccare come in /svincolati. */}
                <label htmlFor="b-ordine" className="fm-label mb-1 block">Ordina per</label>
                <select
                  id="b-ordine"
                  className="fm-select"
                  value={`${colonna}:${verso}`}
                  onChange={(e) => {
                    const [c, v] = e.target.value.split(':')
                    setColonna(c as ColonnaOrdine)
                    setVerso(v as Verso)
                  }}
                >
                  {OPZIONI_ORDINE.map((o) => (
                    <option key={o.valore} value={o.valore}>{o.etichetta}</option>
                  ))}
                </select>
              </div>
            </PannelloFiltri>

            <div className="mb-2">
              {/* Prima la lista era tagliata a 100 elementi senza dirlo: ordinata
                  per nome si fermava a metà della lettera C. */}
              <span className="fm-label">
                {liberiFiltrati.length} giocator{liberiFiltrati.length === 1 ? 'e' : 'i'} su {giocatoriLiberi.length}
              </span>
            </div>

            {/* Altezza in `svh` e non fissa: 600px superava il viewport di molti
                telefoni, e `vh` su iOS è falsato dalla barra degli indirizzi. */}
            <div className="h-[55svh] space-y-1.5 overflow-y-auto pr-1 md:h-[600px]">
              {liberiFiltrati.length === 0 && (
                <div className="p-8 text-center text-sm text-ink-dim">
                  Nessun giocatore trovato con questi filtri.
                </div>
              )}
              {liberiFiltrati.map(g => {
                  const isSelected = selezionati.find(s => s.id === g.id)
                  // Un portiere in piu' non e' selezionabile quando il reparto
                  // e' saturo: il server rifiuterebbe comunque il salvataggio,
                  // ma scoprirlo premendo Salva sarebbe tardi.
                  const bloccato = !isSelected && g.ruolo === 'P' && portieriResidui <= 0
                  return (
                    <div
                      key={g.id}
                      onClick={() => { if (!bloccato) toggleSelezionato(g) }}
                      title={bloccato ? `Hai gia' il numero massimo di portieri (${maxPortieri}).` : undefined}
                      aria-disabled={bloccato}
                      className={`flex items-center justify-between gap-3 rounded-md border p-2.5 transition ${
                        bloccato
                          ? 'cursor-not-allowed border-line bg-panel-hi opacity-45'
                          : isSelected
                            ? 'cursor-pointer border-neon bg-panel-hover'
                            : 'cursor-pointer border-line bg-panel-hi hover:border-line-hi hover:bg-panel-hover'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="fm-nome truncate text-base">{g.nome}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-mid">
                          <span>{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</span>
                          <RuoliGiocatore ruolo={g.ruolo} ruoloMantra={g.ruolo_mantra} />
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className={`fm-badge ${isSelected ? 'fm-badge-top' : 'fm-badge-good'}`}>{g.quotazione}</span>
                      </div>
                    </div>
                  )
              })}
            </div>
          </div>

          {/* Colonna Carrello.
              `order-first` sotto lg: impilata, finiva in fondo a un elenco di
              centinaia di giocatori e il pulsante di salvataggio era
              irraggiungibile senza scorrere tutto. */}
          <div className="order-first min-w-0 space-y-4 lg:order-none">
            <div className="fm-panel overflow-hidden">
              <div className="fm-panel-head fm-panel-head--neon">
                <span className="truncate">{squadra.nome}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                <div className="fm-metric">
                  <div className="fm-metric-label">Budget residuo</div>
                  <div className="fm-metric-value">{squadra.crediti_residui}<span className="text-xs text-ink-dim"> cr</span></div>
                </div>
                <div className="fm-metric">
                  <div className="fm-metric-label">Slot da riempire</div>
                  <div className="fm-metric-value">{slotLiberi}</div>
                </div>
              </div>
            </div>

            <div className="fm-panel overflow-hidden">
              {/* Lo stato sta qui, sopra il pulsante e accanto al conteggio:
                  è il punto in cui si guarda prima di chiudere la pagina, ed
                  è lì che serve sapere se quello che si vede è già al sicuro. */}
              <div className="fm-panel-head">
                <span>I tuoi selezionati</span>
                <span className="flex items-center gap-2">
                  <span className="fm-label">{selezionati.length}/{slotLiberi}</span>
                  <span
                    className={`fm-chip shrink-0 normal-case ${
                      statoBuste === 'salvate'
                        ? 'fm-chip-neon'
                        : statoBuste === 'modificate'
                          ? 'fm-chip-ambra'
                          : ''
                    }`}
                  >
                    {statoBuste === 'salvate'
                      ? '✓ Buste salvate'
                      : statoBuste === 'modificate'
                        ? 'Buste non salvate'
                        : 'Nessuna busta salvata'}
                  </span>
                </span>
              </div>

              <div className="fm-panel-body">
                <div className="mb-4 max-h-[30svh] divide-y divide-line overflow-y-auto lg:max-h-none lg:overflow-visible">
                  {/* La × toglie il giocatore da qui. Prima l'unico modo era
                      ritrovarlo nella lista lunga a fianco e ritoccarlo: con
                      trenta slot da riempire, cambiare idea su un nome
                      costava una ricerca. */}
                  {selezionati.map(g => (
                    <div key={g.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="fm-nome truncate">{g.nome}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="fm-badge fm-badge-good">{g.quotazione}</span>
                        <button
                          type="button"
                          onClick={() => toggleSelezionato(g)}
                          /* Non `.fm-btn`: sotto md quella classe impone 44px
                             di altezza, e con trenta nomi allungherebbe il
                             riquadro di mezzo schermo. 32px restano ben sopra
                             i 24 richiesti dalle linee guida.
                             `-my-1` fa rientrare il bottone nella spaziatura
                             che la riga ha già: misurato, senza margine
                             negativo la riga passa da 35 a 45px, con il
                             margine si ferma a 37 — stesso bersaglio da
                             toccare, 240px risparmiati su una lista piena. */
                          className="flex h-8 w-8 -my-1 items-center justify-center rounded-md text-lg leading-none text-ink-dim transition hover:bg-rosso/15 hover:text-rosso focus-visible:bg-rosso/15 focus-visible:text-rosso"
                          /* Il nome nell'etichetta perché a schermo la × da
                             sola non dice quale riga toglie. */
                          aria-label={`Togli ${g.nome} dalla lista`}
                          title={`Togli ${g.nome}`}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                  {selezionati.length === 0 && (
                    <div className="py-4 text-center text-sm text-ink-dim">Nessun giocatore selezionato</div>
                  )}
                </div>

                <div className="mb-4 border-t border-line pt-3">
                  <div className="flex items-center justify-between">
                    <span className="fm-label">Costo totale</span>
                    <span className={`text-xl font-bold tabular-nums ${costoTotale > squadra.crediti_residui ? 'text-rosso' : 'text-neon'}`}>
                      {costoTotale} cr
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="fm-label">Slot riempiti</span>
                    <span className={`text-lg font-bold tabular-nums ${selezionati.length !== slotLiberi ? 'text-rosso' : 'text-neon'}`}>
                      {selezionati.length} / {slotLiberi}
                    </span>
                  </div>
                  {portieriDisponibili > 0 || portieriScelti > 0 ? (
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="fm-label">Portieri</span>
                      <span className={`text-lg font-bold tabular-nums ${portieriResidui < 0 ? 'text-rosso' : 'text-ink'}`}>
                        {portieriScelti} / {portieriDisponibili}
                      </span>
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={submitBuste}
                  disabled={!isValida}
                  className="fm-btn fm-btn-primary w-full"
                >
                  Salva la lista
                </button>
                {!isValida ? (
                  <p className="mt-2.5 text-center text-xs font-semibold text-rosso">
                    {portieriResidui < 0
                      ? `Puoi prendere al massimo ${portieriDisponibili} portier${portieriDisponibili === 1 ? 'e' : 'i'}.`
                      : 'Devi riempire esattamente tutti gli slot e non superare il budget.'}
                  </p>
                ) : statoBuste === 'modificate' ? (
                  /* La pastiglia in cima al riquadro dice lo stato, ma chi ha
                     appena finito di scegliere guarda il pulsante: qui serve
                     l'invito ad agire, non la constatazione. */
                  <p className="mt-2.5 text-center text-xs font-semibold text-ambra">
                    La lista è a posto ma non è ancora salvata.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Sommario buste: chi si è preso un giocatore SENZA passare dall'asta,
          di tutte le squadre. Prima dopo lo spoglio ognuno vedeva solo i propri
          esiti, e dove fosse finito un giocatore non si leggeva da nessuna
          parte.

          Sta in fondo e vale in entrambe le fasi: sono turni già spogliati,
          quindi non svela niente di quello in corso. */}
      {sommarioPerTurno.length > 0 && (
        <div className="fm-panel mt-5 overflow-hidden">
          <div className="fm-panel-head">
            <div>
              <span>Sommario buste</span>
              <p className="mt-0.5 text-xs font-normal normal-case tracking-normal text-ink-dim">
                Chi è stato assegnato senza passare dall&apos;asta, di tutte le squadre.
              </p>
            </div>
            <span className="fm-chip shrink-0">{sommario.length}</span>
          </div>

          <div className="fm-panel-body space-y-5">
            {sommarioPerTurno.map(([turno, righe]) => (
              <div key={turno}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="fm-chip fm-chip-attivo">Turno {turno}</span>
                  <div className="flex-1 border-t border-line" />
                  <span className="fm-label shrink-0">{righe.length}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {righe.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel-hi p-2.5">
                      <div className="min-w-0">
                        {/* Optional chaining ovunque: una busta orfana non deve
                            far cadere la pagina, come già successo altrove. */}
                        <div className="fm-nome truncate text-base">{b.giocatori?.nome ?? 'Giocatore rimosso'}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-viola-hi">{b.squadre?.nome ?? '—'}</span>
                          <span className="text-ink-dim">·</span>
                          <span className="text-ink-mid">{b.giocatori?.squadra}</span>
                          <RuoliGiocatore ruolo={b.giocatori?.ruolo} ruoloMantra={b.giocatori?.ruolo_mantra} />
                        </div>
                      </div>
                      <span className="fm-badge fm-badge-good shrink-0">{b.giocatori?.quotazione} cr</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Conferma
        aperta={avviso !== null}
        titolo={avviso?.titolo ?? ''}
        messaggio={avviso?.testo ?? ''}
        tono={avviso?.tono === 'errore' ? 'pericolo' : 'neutro'}
        soloConferma
        testoConferma="Ho capito"
        onConferma={() => setAvviso(null)}
        onAnnulla={() => setAvviso(null)}
      />
    </div>
  )
}
