'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import Marchio from '@/components/Marchio'
import { isAdminRole, isSuperAdminRole } from '@/utils/auth-shared'

type ProfiloNavBar = {
  ruolo: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER'
  squadra_id: string | null
  squadre: { nome: string; crediti_residui: number; slot_occupati: number } | null
}

type Voce = { href: string; label: string; soloSuper?: boolean }

// Le voci stavano scritte a mano due volte, una per il menu desktop e una per
// ogni ternario di stato attivo. Elencandole qui si restilizzano una volta
// sola e il menu mobile non può divergere da quello desktop.
const VOCI_UTENTE: Voce[] = [
  { href: '/asta', label: 'Asta Live' },
  // "Sommario Aste" e non piu' "Aste a Chiamata": con /asta accanto, due nomi
  // che differiscono per una lettera costringevano a fermarsi a pensare.
  { href: '/aste', label: 'Sommario Aste' },
  { href: '/rose', label: 'Tutte le Rose' },
  { href: '/mia-rosa', label: 'La mia Rosa' },
  { href: '/svincolati', label: 'Svincolati' },
  { href: '/trasferimenti', label: 'Lista Trasferimenti' },
  // "Storico Aste" non c'e' piu': e' una scheda dentro Sommario Aste.
  { href: '/buste', label: 'Buste' },
]

// Senza emoji: erano un segnaposto in attesa di un'identita' visiva, e
// accanto al marchio facevano rumore. Le voci si distinguono gia' per
// posizione e per la tinta della tendina che le contiene.
const VOCI_ADMIN: Voce[] = [
  { href: '/admin/setup', label: 'Impostazioni', soloSuper: true },
  { href: '/admin/asta', label: 'Regia Aste' },
  { href: '/admin/trasferimenti', label: 'Ratifica Scambi' },
  // "Controllo Slot" e' durata un commit: /admin/riepilogo mostrava gia' gli
  // slot per squadra, e bastava aggiungerci il totale per rendere l'altra
  // pagina superflua. Meglio un dato in un posto solo che due pagine da
  // ricordarsi di confrontare.
  { href: '/admin/riepilogo', label: 'Budget e Fasi' },
]

export default function NavBar() {
  const supabase = createClient()
  const pathname = usePathname()
  // Utente verificato dal server, non la sessione letta dal cookie.
  const [utente, setUtente] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [username, setUsername] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [budgetInfo, setBudgetInfo] = useState<{ budget: number; extrabudget: number; slotLiberi: number } | null>(null)
  // Serve per sottoscriversi ai cambiamenti della propria squadra.
  const [squadraId, setSquadraId] = useState<string | null>(null)
  const [menuAperto, setMenuAperto] = useState(false)

  const smontato = useRef(false)
  useEffect(() => {
    smontato.current = false
    return () => { smontato.current = true }
  }, [])

  const azzera = useCallback(() => {
    setUtente(null)
    setIsAdmin(false)
    setIsSuperAdmin(false)
    setUsername('')
    setBudgetInfo(null)
    setSquadraId(null)
    setLoading(false)
  }, [])

  const caricaDati = useCallback(async () => {
    // getUser() e non getSession(): getSession legge solo il cookie locale e
    // non verifica nulla lato server, quindi dopo un hard reset continuava a
    // mostrare la navbar di un utente ormai cancellato.
    const { data: { user }, error } = await supabase.auth.getUser()
    if (smontato.current) return
    if (error || !user) { azzera(); return }

    const { data } = await supabase
      .from('profili')
      .select('ruolo, squadra_id, squadre(nome, crediti_residui, slot_occupati)')
      .eq('id', user.id)
      .maybeSingle()
    if (smontato.current) return

    const profilo = data as unknown as ProfiloNavBar | null

    // Nessun profilo: l'account non esiste più (tipicamente dopo un hard
    // reset). La sessione locale è stantìa, la si butta via.
    if (!profilo) {
      await supabase.auth.signOut()
      if (smontato.current) return
      azzera()
      return
    }

    setUtente(user)
    // isAdmin include il SUPER_ADMIN, coerentemente con il resto dell'app.
    setIsAdmin(isAdminRole(profilo.ruolo))
    setIsSuperAdmin(isSuperAdminRole(profilo.ruolo))
    setSquadraId(profilo.squadra_id)

    const metaName = user.user_metadata?.nome_utente
    setUsername(metaName || profilo.squadre?.nome || user.email?.split('@')[0] || 'Utente')

    if (profilo.squadra_id && profilo.squadre) {
      const { data: regole } = await supabase
        .from('regole_lega').select('slot_totali').limit(1).maybeSingle()
      if (smontato.current) return
      const slotTotali = regole?.slot_totali ?? 30

      // `!inner` + filtro sullo stato: i giocatori già tesserati non vanno
      // conteggiati, altrimenti l'extra budget risulta più basso del vero.
      // È lo stesso criterio di calcola_massimo_offribile().
      const { data: asteAttive } = await supabase
        .from('liste_aste')
        .select('giocatori!inner(quotazione, stato)')
        .eq('squadra_id', profilo.squadra_id)
        .neq('giocatori.stato', 'TESSERATO')
      if (smontato.current) return

      const lista = (asteAttive ?? []) as unknown as { giocatori: { quotazione: number } | null }[]
      const countAste = lista.length
      // `giocatori` può essere null se la join non trova il giocatore.
      const sumQuotazioni = lista.reduce((sum, item) => sum + (item.giocatori?.quotazione ?? 0), 0)

      const slotVuoti = slotTotali - (profilo.squadre.slot_occupati || 0)
      const astePerse = Math.max(0, slotVuoti - countAste)

      // Extra budget: crediti residui meno il valore dei giocatori ancora in
      // lista, meno 1 credito per ogni slot che resterebbe scoperto.
      const extrabudget = (profilo.squadre.crediti_residui || 0) - sumQuotazioni - astePerse

      setBudgetInfo({ budget: profilo.squadre.crediti_residui, extrabudget, slotLiberi: slotVuoti })
    } else {
      setBudgetInfo(null)
    }
    setLoading(false)
  }, [supabase, azzera])

  useEffect(() => {
    void caricaDati()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Chiamare altri metodi auth in modo sincrono dentro onAuthStateChange
      // può bloccare il client supabase-js: rimandiamo al tick successivo.
      setTimeout(() => { void caricaDati() }, 0)
    })

    return () => { subscription.unsubscribe() }
  }, [caricaDati, supabase])

  // Aggiornamento in tempo reale dei dati mostrati nella navbar.
  //
  // Prima si osservava solo `profili`, che cambia soltanto quando cambia il
  // ruolo. Vincere un'asta aggiorna invece `squadre` (crediti e slot), quindi
  // budget ed extra budget restavano fermi ai valori pre-asta.
  useEffect(() => {
    const idUtente = utente?.id
    if (!idUtente) return

    let canale: RealtimeChannel = supabase
      .channel(`navbar-${idUtente}-${Date.now()}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profili', filter: `id=eq.${idUtente}` },
        () => { void caricaDati() })

    if (squadraId) {
      canale = canale
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'squadre', filter: `id=eq.${squadraId}` },
          () => { void caricaDati() })
        // L'extra budget dipende anche dai giocatori ancora in lista chiamate.
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'liste_aste', filter: `squadra_id=eq.${squadraId}` },
          () => { void caricaDati() })
    }

    canale.subscribe((stato, err) => {
      if (stato === 'CHANNEL_ERROR' || stato === 'TIMED_OUT') {
        console.warn('[NavBar] canale realtime in stato', stato, err)
      }
    })

    return () => { supabase.removeChannel(canale) }
  }, [utente?.id, squadraId, caricaDati, supabase])

  // Next non smonta la navbar cambiando rotta: senza questo il pannello mobile
  // resterebbe aperto dopo ogni tocco su una voce.
  useEffect(() => { setMenuAperto(false) }, [pathname])

  // La navbar compare solo se il server ha confermato l'utente.
  if (loading || !utente) return null

  const isActive = (path: string) => pathname === path

  const vociUtente = isSuperAdmin ? [] : VOCI_UTENTE
  const vociAdmin = isAdmin ? VOCI_ADMIN.filter((v) => !v.soloSuper || isSuperAdmin) : []

  // Voce di una tendina desktop
  const voceTendina = (v: Voce, tinta: 'viola' | 'rosso') => (
    <Link
      key={v.href}
      href={v.href}
      className={`block border-l-2 px-3 py-2 text-sm font-semibold transition ${
        isActive(v.href)
          ? tinta === 'rosso'
            ? 'border-rosso bg-panel-hover text-rosso'
            : 'border-neon bg-panel-hover text-neon'
          : 'border-transparent text-ink-mid hover:bg-panel-hover hover:text-ink'
      }`}
    >
      {v.label}
    </Link>
  )

  // Voce del pannello mobile
  const voceMobile = (v: Voce) => (
    <Link
      key={v.href}
      href={v.href}
      className={`block border-l-2 px-4 py-3 text-sm font-semibold transition ${
        isActive(v.href)
          ? 'border-neon bg-panel-hover text-neon'
          : 'border-transparent text-ink-mid hover:bg-panel-hover hover:text-ink'
      }`}
    >
      {v.label}
    </Link>
  )

  const metriche = budgetInfo && !isSuperAdmin ? (
    <>
      <div className="flex flex-col text-center">
        <span className="fm-label leading-none">Budget</span>
        <span className="text-sm font-bold tabular-nums leading-tight text-ink">
          {budgetInfo.budget}<span className="text-[10px] font-normal text-ink-dim"> cr</span>
        </span>
      </div>
      <div className="h-6 w-px bg-line-hi" />
      <div className="flex flex-col text-center">
        <span
          className="fm-label leading-none"
          title="Budget virtuale: budget attuale meno il valore dei giocatori ancora in asta"
        >
          Extra
        </span>
        <span
          className={`text-sm font-bold tabular-nums leading-tight ${
            budgetInfo.extrabudget < 0 ? 'text-rosso' : 'text-neon'
          }`}
        >
          {budgetInfo.extrabudget}<span className="text-[10px] font-normal text-ink-dim"> cr</span>
        </span>
      </div>
      <div className="h-6 w-px bg-line-hi" />
      <div className="flex flex-col text-center">
        <span className="fm-label leading-none">Slot liberi</span>
        <span className="text-sm font-bold tabular-nums leading-tight text-ink">{budgetInfo.slotLiberi}</span>
      </div>
    </>
  ) : null

  const esci = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const distintivoRuolo = isSuperAdmin ? (
    <span title="Super Admin">👑</span>
  ) : isAdmin ? (
    <span title="Admin" className="text-ambra">⭐</span>
  ) : null

  return (
    <nav className="border-b border-line-hi bg-panel-hi">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-3">

          {/* ---------- Sinistra ---------- */}
          <div className="flex min-w-0 items-center gap-2 md:gap-5">
            {/* Sotto md restano solo hamburger e logo: sommando chip utente e
                "Esci" la barra sforava già i 375px. */}
            <button
              type="button"
              onClick={() => setMenuAperto((v) => !v)}
              aria-expanded={menuAperto}
              aria-controls="menu-mobile"
              aria-label={menuAperto ? 'Chiudi il menu' : 'Apri il menu'}
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-mid transition hover:bg-panel-hover hover:text-ink md:hidden"
            >
              <span className="text-lg leading-none">{menuAperto ? '✕' : '☰'}</span>
            </button>

            <Link href="/asta" className="fm-title flex shrink-0 items-center gap-2 text-lg sm:text-xl">
              <Marchio />
              <span>Fanta<span className="text-neon">Asta</span></span>
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {/* Le tendine si aprivano solo con group-hover, e in Tailwind v4
                  hover: è racchiuso in @media (hover: hover): su tablet erano
                  quindi inapribili. group-focus-within le apre al tocco e da
                  tastiera. */}
              {vociUtente.length > 0 && (
                <div className="group relative">
                  <button className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-ink-mid transition hover:bg-panel-hover hover:text-ink">
                    Manager <span className="text-[10px]">▼</span>
                  </button>
                  <div className="invisible absolute left-0 z-50 mt-1 w-52 overflow-hidden rounded-md border border-line-hi bg-panel opacity-0 shadow-xl transition-all duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {vociUtente.map((v) => voceTendina(v, 'viola'))}
                  </div>
                </div>
              )}

              {vociAdmin.length > 0 && (
                <div className="group relative ml-2 border-l border-line-hi pl-3">
                  <button className="flex items-center gap-1.5 rounded-md border border-rosso/40 bg-rosso/10 px-3 py-2 text-sm font-semibold text-rosso transition hover:bg-rosso/20">
                    Admin <span className="text-[10px]">▼</span>
                  </button>
                  <div className="invisible absolute left-3 z-50 mt-1 w-56 overflow-hidden rounded-md border border-line-hi bg-panel opacity-0 shadow-xl transition-all duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {vociAdmin.map((v) => voceTendina(v, 'rosso'))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ---------- Destra (solo da md in su) ---------- */}
          <div className="hidden items-center gap-3 md:flex">
            {metriche && (
              <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-1.5">
                {metriche}
              </div>
            )}

            <div className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-ink-mid">
              <span className="max-w-[14ch] truncate">👤 {username}</span>
              {distintivoRuolo}
            </div>

            <button onClick={esci} className="fm-btn fm-btn-ghost fm-btn-sm">
              Esci
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Striscia metriche, sempre visibile su mobile ----------
          Prima era `hidden sm:flex`: il budget residuo spariva proprio sul
          dispositivo con cui si segue l'asta. */}
      {metriche && (
        <div className="flex items-center justify-around gap-2 border-t border-line bg-panel px-3 py-1.5 md:hidden">
          {metriche}
        </div>
      )}

      {/* ---------- Pannello mobile ----------
          In flusso e non sovrapposto: la nav non è sticky, quindi non servono
          z-index, blocco dello scroll né trappola del focus. */}
      {menuAperto && (
        <div id="menu-mobile" className="border-t border-line-hi bg-panel md:hidden">
          {vociUtente.map(voceMobile)}

          {vociAdmin.length > 0 && (
            <>
              <div className="border-t border-line bg-panel-hi px-4 py-1.5">
                <span className="fm-label text-rosso">Admin</span>
              </div>
              {vociAdmin.map(voceMobile)}
            </>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-line-hi px-4 py-3">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink-mid">
              <span className="truncate">👤 {username}</span>
              {distintivoRuolo}
            </span>
            <button onClick={esci} className="fm-btn fm-btn-ghost fm-btn-sm shrink-0">
              Esci
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
