'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { descriviStato, elencoAbbandoni, type AstaCorrente, type Annuncio } from '@/utils/statoLega'

/**
 * La fascia sotto la barra che dice sempre «a che punto siamo».
 *
 * Le frasi le compone `descriviStato()` in `utils/statoLega.ts`, che è pura e
 * provata: qui dentro c'è solo il mestiere sporco — leggere, stare in ascolto,
 * e tenere acceso l'annuncio per una decina di secondi.
 *
 * **Canale proprio, non quello della NavBar.** Il piano era di appendersi al
 * canale `navbar-…`, ma condividerlo significa che un binding sbagliato
 * (per esempio su una tabella fuori dalla publication realtime) azzera la
 * consegna dell'intero canale pur restando `SUBSCRIBED` — trappola già pagata
 * in questo progetto, vedi `20260802130000_realtime_liste_aste.sql`. Con un
 * canale separato il peggio che può capitare è che si fermi questa riga,
 * mentre budget ed extra continuano ad aggiornarsi. I canali viaggiano
 * comunque su una sola connessione WebSocket, quindi non se ne paga una in più.
 */

/**
 * Quanto resta acceso un annuncio prima di lasciare il posto allo stato.
 *
 * Dieci secondi e non venti: `chiudi_asta` assegna il giocatore e fa avanzare
 * il turno nello stesso istante, quindi **finché l'annuncio è acceso la fascia
 * non dice di chi è il turno**. Ogni secondo in più qui è un secondo in cui
 * chi deve chiamare legge chi ha vinto l'asta precedente invece di «Tocca a
 * te», e l'attesa fra una chiamata e l'altra è il motivo per cui questa riga
 * esiste. Dieci bastano a leggere una frase; venti si sentivano.
 */
const DURATA_ANNUNCIO = 10_000

type Props = {
  /** `null` per il super admin, che non ha squadra. */
  squadraId: string | null
  /** Già calcolato dalla NavBar: non lo si ricalcola qui. */
  slotLiberi: number | null
}

type RigaAsta = {
  id: string
  stato: string
  giocatore_id: number
  prezzo_corrente: number
  squadra_in_testa: string | null
  scadenza_corrente: string | null
  abbandoni: unknown
  giocatori: { nome: string; stato: string } | null
}

export default function RigaStato({ squadraId, slotLiberi }: Props) {
  const supabase = createClient()

  const [ordineChiamata, setOrdineChiamata] = useState<string[]>([])
  const [indiceChiamata, setIndiceChiamata] = useState(1)
  const [giroDaConfermare, setGiroDaConfermare] = useState(false)
  const [faseBusteAperta, setFaseBusteAperta] = useState(false)
  const [bustaConsegnata, setBustaConsegnata] = useState(false)
  const [nomiSquadre, setNomiSquadre] = useState<Record<string, string>>({})
  const [squadreAttive, setSquadreAttive] = useState<Set<string> | null>(null)
  const [asta, setAsta] = useState<AstaCorrente | null>(null)
  const [annuncio, setAnnuncio] = useState<Annuncio | null>(null)
  const [aperto, setAperto] = useState(false)
  /** L'ora come stato: vedi la nota sull'effetto che la fa avanzare. */
  const [adesso, setAdesso] = useState(() => Date.now())

  // L'asta che stiamo mostrando, leggibile dentro le callback del realtime
  // senza rimetterle nelle dipendenze (rifarebbero il canale a ogni rilancio).
  const astaRef = useRef<{ id: string; giocatoreId: number } | null>(null)
  const ordineRef = useRef<string[]>([])
  const smontato = useRef(false)
  const timerAnnuncio = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    smontato.current = false
    return () => {
      smontato.current = true
      if (timerAnnuncio.current) clearTimeout(timerAnnuncio.current)
    }
  }, [])

  const mostraAnnuncio = useCallback((a: Annuncio) => {
    if (timerAnnuncio.current) clearTimeout(timerAnnuncio.current)
    setAnnuncio(a)
    timerAnnuncio.current = setTimeout(() => {
      if (!smontato.current) setAnnuncio(null)
    }, DURATA_ANNUNCIO)
  }, [])

  const leggi = useCallback(async () => {
    const { data: regole } = await supabase
      .from('regole_lega')
      .select('ordine_chiamata, indice_chiamata, fase_buste_aperta, turno_buste, slot_totali, giro_da_confermare')
      .limit(1)
      .maybeSingle()
    if (smontato.current) return
    // Dopo l'await non siamo piu' nel disegno: qui leggere l'orologio e' lecito,
    // e tiene allineata la riga anche su una scheda lasciata aperta per ore.
    setAdesso(Date.now())

    const ordine = regole?.ordine_chiamata ?? []
    const buste = regole?.fase_buste_aperta ?? false
    ordineRef.current = ordine
    setOrdineChiamata(ordine)
    setIndiceChiamata(regole?.indice_chiamata ?? 1)
    setGiroDaConfermare(regole?.giro_da_confermare ?? false)
    setFaseBusteAperta(buste)

    const { data: squadre } = await supabase.from('squadre').select('id, nome, slot_occupati')
    if (smontato.current) return
    const nomi: Record<string, string> = {}
    for (const s of squadre ?? []) nomi[s.id] = s.nome
    setNomiSquadre(nomi)

    // L'asta viva. `maybeSingle` non va bene: `aste` conserva una riga per
    // ogni giocatore mai chiamato, e il filtro sullo stato ne lascia passare
    // una sola solo finché l'admin non ne apre due (che il flusso non
    // consente, ma un `limit(1)` costa meno di una pagina che esplode).
    const { data: righeAsta } = await supabase
      .from('aste')
      .select('id, stato, giocatore_id, prezzo_corrente, squadra_in_testa, scadenza_corrente, abbandoni, giocatori(nome, stato)')
      .in('stato', ['CHIAMATA', 'IN_CORSO'])
      .limit(1)
    if (smontato.current) return

    const riga = (righeAsta ?? [])[0] as unknown as RigaAsta | undefined
    if (riga) {
      astaRef.current = { id: riga.id, giocatoreId: riga.giocatore_id }

      // Chi e' in gara per questo giocatore. Sta qui e non nella callback dei
      // rilanci perche' non cambia per tutta la durata dell'asta: i ritiri
      // arrivano invece dentro `aste.abbandoni`, che viaggia gia' nel payload.
      const { data: inGara } = await supabase
        .from('liste_aste').select('squadra_id').eq('giocatore_id', riga.giocatore_id)
      if (smontato.current) return

      setAsta({
        stato: riga.stato as 'CHIAMATA' | 'IN_CORSO',
        giocatore: riga.giocatori?.nome ?? 'un giocatore',
        prezzo: riga.prezzo_corrente,
        squadraInTesta: riga.squadra_in_testa,
        scadenza: riga.scadenza_corrente,
        contendenti: (inGara ?? []).map((r: { squadra_id: string }) => r.squadra_id),
        abbandoni: elencoAbbandoni(riga.abbandoni),
      })
      // Con un'asta aperta il «poi tocca a…» non si mostra: risparmia la
      // query e non c'è nessuno a cui interessi il turno successivo adesso.
      setSquadreAttive(null)
    } else {
      astaRef.current = null
      setAsta(null)

      // Chi ha ancora qualcuno da chiamare: stesso criterio di
      // `avanza_turno_chiamata()` e di `TabelloneAsta` (rosa non piena E
      // almeno un giocatore libero in lista). Serve sia per il «poi», sia per
      // accorgersi che le aste a chiamata sono finite.
      const { data: liste } = await supabase
        .from('liste_aste')
        .select('squadra_id, giocatori!inner(stato)')
        .eq('giocatori.stato', 'LIBERO')
      if (smontato.current) return

      const slotTotali = regole?.slot_totali ?? 30
      const conChiamate = new Set((liste ?? []).map((r: { squadra_id: string }) => r.squadra_id))
      setSquadreAttive(new Set(
        (squadre ?? [])
          .filter((s) => (s.slot_occupati ?? 0) < slotTotali && conChiamate.has(s.id))
          .map((s) => s.id)
      ))
    }

    // Solo a buste aperte: fuori da quella fase è una query che non serve.
    if (buste && squadraId) {
      const { count } = await supabase
        .from('buste')
        .select('giocatore_id', { count: 'exact', head: true })
        .eq('squadra_id', squadraId)
        .eq('turno', regole?.turno_buste ?? 1)
      if (smontato.current) return
      setBustaConsegnata((count ?? 0) > 0)
    } else {
      setBustaConsegnata(false)
    }
  }, [supabase, squadraId])

  // `leggi` è async e sospende sul primo `await` (la query a regole_lega) prima
  // di toccare qualunque stato: nessun setState avviene in modo sincrono qui
  // dentro. La regola non vede attraverso l'async e segnalerebbe allo stesso
  // modo il caricamento iniziale di qualunque componente.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void leggi() }, [leggi])

  /**
   * L'ora, come stato invece che letta durante il disegno.
   *
   * **Non è un capriccio del linter, era un difetto.** Il passaggio da «in
   * asta» ad «asta finita, l'admin deve assegnare» dipende solo dall'orologio:
   * quando il tempo scade **non arriva nessun evento**, perché a database non
   * cambia niente — `chiudi_asta` scatta solo quando l'admin preme il pulsante.
   * Con `Date.now()` letto nel corpo del componente la riga sarebbe rimasta su
   * «in asta» con il conto fermo a zero fino al salvagente dei 30 secondi.
   *
   * Un solo `setTimeout` puntato sull'istante della scadenza, non un battito
   * al secondo: i secondi che scorrono li disegna già `ContoAllaRovescia`, che
   * è isolato apposta per non ridisegnare la barra su ogni pagina del sito.
   */
  const scadenzaAsta = asta?.stato === 'IN_CORSO' ? asta.scadenza : null
  useEffect(() => {
    if (!scadenzaAsta) return
    const manca = new Date(scadenzaAsta).getTime() - Date.now()
    if (manca <= 0) return
    // Un quarto di secondo di margine: senza, il timer può scattare un
    // millisecondo prima e trovare la scadenza ancora tecnicamente futura.
    const t = setTimeout(() => setAdesso(Date.now()), manca + 250)
    return () => clearTimeout(t)
  }, [scadenzaAsta])

  /**
   * Legge com'è finita e ne fa un annuncio.
   *
   * Non si dà per scontato che l'asta si sia conclusa con un'assegnazione:
   * `chiudi_asta` chiude **senza assegnare** quando la rosa o il ruolo di chi
   * era in testa sono nel frattempo diventati pieni. Annunciare un vincitore
   * che non ha vinto sarebbe il difetto peggiore di tutta la funzione, quindi
   * la prova è lo stato del giocatore, non il fatto che l'asta sia chiusa.
   */
  const annunciaChiusura = useCallback(async (astaId: string) => {
    const { data } = await supabase
      .from('aste')
      .select('prezzo_corrente, squadra_in_testa, giocatori(nome, stato), squadre:squadra_in_testa(nome)')
      .eq('id', astaId)
      .maybeSingle()
    if (smontato.current || !data) return

    const riga = data as unknown as {
      prezzo_corrente: number
      giocatori: { nome: string; stato: string } | null
      squadre: { nome: string } | null
    }
    const giocatore = riga.giocatori?.nome ?? 'Il giocatore'
    if (riga.giocatori?.stato !== 'TESSERATO') {
      mostraAnnuncio({ tipo: 'non-assegnato', giocatore })
      return
    }
    mostraAnnuncio({
      tipo: 'aggiudicato',
      giocatore,
      squadra: riga.squadre?.nome ?? null,
      prezzo: riga.prezzo_corrente,
    })
  }, [supabase, mostraAnnuncio])

  useEffect(() => {
    // Topic univoco: con un nome fisso due istanze montate insieme (o il
    // doppio mount di StrictMode) collidono sullo stesso canale.
    const canale: RealtimeChannel = supabase
      .channel(`riga-stato-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aste' }, (payload) => {
        const n = payload.new as Partial<RigaAsta> & { stato?: string } | null
        if (!n?.stato) { void leggi(); return }

        // Un'asta che si chiude è l'unico fatto che lo stato a database non
        // racconta più un istante dopo: `chiudi_asta` assegna il giocatore e
        // fa avanzare il turno insieme.
        if (n.stato === 'CHIUSA') {
          const nostra = astaRef.current
          astaRef.current = null
          if (nostra && n.id === nostra.id) void annunciaChiusura(nostra.id)
          void leggi()
          return
        }

        // Rilancio sulla stessa asta: il payload porta già prezzo e squadra in
        // testa. Rileggere il database a ogni offerta significherebbe, con
        // dieci rilanci in venti secondi, dieci giri di query per ognuno dei
        // manager collegati — su ogni pagina del sito, non solo su /asta.
        const nostra = astaRef.current
        if (nostra && n.id === nostra.id && n.giocatore_id === nostra.giocatoreId) {
          setAsta((prec) => prec && ({
            ...prec,
            stato: n.stato as 'CHIAMATA' | 'IN_CORSO',
            prezzo: n.prezzo_corrente ?? prec.prezzo,
            // `!== undefined` e non `??`: `squadra_in_testa` può valere NULL, e
            // con `??` un ritorno a "nessuno in testa" verrebbe scambiato per
            // "campo assente" e la barra continuerebbe a nominare chi non c'è più.
            squadraInTesta: n.squadra_in_testa !== undefined ? n.squadra_in_testa : prec.squadraInTesta,
            scadenza: n.scadenza_corrente ?? null,
            // Un ritiro e' un UPDATE su questa colonna: arriva di qui, senza
            // una query in piu'. `contendenti` resta com'e', non cambia.
            abbandoni: n.abbandoni !== undefined ? elencoAbbandoni(n.abbandoni) : prec.abbandoni,
          }))
          return
        }
        void leggi()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'regole_lega' }, (payload) => {
        const n = payload.new as { ordine_chiamata?: string[]; indice_chiamata?: number; fase_buste_aperta?: boolean; giro_da_confermare?: boolean }
        const nuovo = n.ordine_chiamata ?? []
        const prima = ordineRef.current
        // Sorteggio: l'ordine è cambiato davvero, non è solo avanzato il turno.
        const sorteggiato = nuovo.length > 0 &&
          (prima.length !== nuovo.length || prima.some((id, i) => id !== nuovo[i]))
        ordineRef.current = nuovo
        setOrdineChiamata(nuovo)
        setIndiceChiamata(n.indice_chiamata ?? 1)
        // Preso dal payload e non solo dalla rilettura: e' il campo che spegne
        // il «Tocca a X», e finche' non arriva la fascia direbbe a qualcuno di
        // chiamare mentre il database gli risponderebbe di no.
        setGiroDaConfermare(n.giro_da_confermare ?? false)
        if (sorteggiato) mostraAnnuncio({ tipo: 'sorteggio' })
        // fase_buste_aperta e i conteggi passano da una rilettura piena.
        void leggi()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buste' }, () => { void leggi() })
      .subscribe((stato, err) => {
        // Un canale rotto va visto: Supabase può riportare SUBSCRIBED e non
        // consegnare nulla. CLOSED non è un guasto, è lo smontaggio normale.
        if (stato === 'CHANNEL_ERROR' || stato === 'TIMED_OUT') {
          console.warn('[RigaStato] canale realtime in stato', stato, err)
        }
      })

    // Rete di sicurezza, come in TabelloneAsta: se il realtime non consegna,
    // la riga si riallinea comunque. 30s e non 15: qui non c'è da cliccare.
    const salvagente = setInterval(() => { void leggi() }, 30_000)

    return () => {
      clearInterval(salvagente)
      supabase.removeChannel(canale)
    }
  }, [supabase, leggi, mostraAnnuncio, annunciaChiusura])

  const riga = descriviStato({
    ordineChiamata,
    indiceChiamata,
    giroDaConfermare,
    faseBusteAperta,
    asta,
    annuncio,
    miaSquadraId: squadraId,
    nomiSquadre,
    slotLiberi,
    bustaConsegnata,
    squadreAttive,
    adesso,
  })

  return (
    <div className={`fm-stato fm-stato-${riga.tono}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-3 sm:px-6 lg:px-8">
        {/* L'etichetta di fase al posto del pallino: occupa lo stesso spazio e
            porta un'informazione invece di una decorazione. */}
        <span className="fm-stato-tag">{riga.etichetta}</span>
        <Link href={riga.href} className="fm-stato-testo min-w-0 flex-1 truncate">
          {riga.testo}
        </Link>
        {/* Il conto alla rovescia staccato dal testo e in fondo: appeso in coda
            spariva sotto i puntini di sospensione proprio sugli schermi
            stretti, cioe' dove serve di piu'. */}
        {riga.scadenza && <ContoAllaRovescia scadenza={riga.scadenza} />}
        {riga.dettaglio.length > 0 && (
          <button
            type="button"
            onClick={() => setAperto((v) => !v)}
            aria-expanded={aperto}
            aria-label={aperto ? 'Nascondi l’ordine di chiamata' : 'Mostra l’ordine di chiamata'}
            className="-my-1 shrink-0 rounded-sm px-2 py-1 text-xs leading-none opacity-70 transition hover:opacity-100"
          >
            {aperto ? '▲' : '▼'}
          </button>
        )}
      </div>

      {aperto && riga.dettaglio.length > 0 && (
        <ol className="mx-auto flex max-w-7xl flex-wrap gap-x-1.5 gap-y-1 px-3 pb-1.5 pt-1 text-xs sm:px-6 lg:px-8">
          {riga.dettaglio.map((nome, i) => (
            <li
              key={`${nome}-${i}`}
              className={`fm-chip ${i === indiceChiamata - 1 ? 'fm-chip-attivo' : ''}`}
            >
              <span className="tabular-nums opacity-60">{i + 1}</span> {nome}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * I secondi che mancano.
 *
 * Componente a sé perché ha un `setInterval` da un secondo: dentro la riga
 * farebbe ridisegnare l'intera barra — quindi su ogni pagina del sito — una
 * volta al secondo per aggiornare due cifre.
 */
function ContoAllaRovescia({ scadenza }: { scadenza: string }) {
  const [restano, setRestano] = useState<number | null>(null)

  useEffect(() => {
    // Primo aggiornamento immediato ma asincrono: leggere l'orologio nel corpo
    // dell'effect è ciò che provoca i render a cascata (nota già in
    // TabelloneAsta, dove lo stesso calcolo era stato sistemato così).
    const aggiorna = () => {
      const d = Math.floor((new Date(scadenza).getTime() - Date.now()) / 1000)
      setRestano(d > 0 ? d : 0)
    }
    const primo = setTimeout(aggiorna, 0)
    const battito = setInterval(aggiorna, 1000)
    return () => { clearTimeout(primo); clearInterval(battito) }
  }, [scadenza])

  if (restano === null) return null
  return (
    <span className={`fm-stato-tempo ${restano <= 5 ? 'animate-battito' : ''}`}>
      {restano}<span className="opacity-60">s</span>
    </span>
  )
}
