import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import LogoSquadra from '@/components/LogoSquadra'
import RuoliGiocatore from '@/components/RuoliGiocatore'

export const dynamic = 'force-dynamic'

/**
 * Chi si è preso un giocatore **senza passare dall'asta**, di tutte le squadre.
 *
 * Era un riquadro in fondo a `/buste`, dove si vedeva solo scorrendo oltre la
 * lista dei 231 svincolati e la propria selezione: la domanda «dov'è finito
 * quel giocatore?» si fa anche a fase chiusa, quando in `/buste` non c'è altro
 * da fare.
 *
 * **Pagina server e non client**, al contrario di `/buste`: qui non si scrive
 * niente, non serve il tempo reale e non c'è stato da tenere. `/buste` è un
 * componente client pesante — lista, filtri, preferiti, bozza, canale realtime —
 * e portarsi dietro tutto quel carico per mostrare una tabella sarebbe stato lo
 * spreco che ha motivato lo scorporo.
 *
 * La policy `lettura_buste` rende leggibili le buste già spogliate a chiunque;
 * quelle ancora in ATTESA restano visibili solo a chi le ha scritte. Il filtro
 * su `esito = VINTO` non è quindi una protezione — è la RLS a proteggere — ma
 * l'elenco di ciò che è stato effettivamente assegnato.
 */

type BustaVinta = {
  id: string
  turno: number | null
  squadre: { nome: string } | null
  giocatori: {
    nome: string
    ruolo: string | null
    ruolo_mantra: string[] | null
    squadra: string | null
    quotazione: number | null
  } | null
}

export default async function SommarioBustePage() {
  await requireUtente()
  const supabase = await createClient()

  const { data } = await supabase
    .from('buste')
    .select('id, turno, squadre(nome), giocatori(nome, ruolo, ruolo_mantra, squadra, quotazione)')
    .eq('esito', 'VINTO')
    .order('turno', { ascending: false })

  const righe = (data ?? []) as unknown as BustaVinta[]

  // Raggruppate per tornata, dalla più recente. Dentro ogni tornata l'ordine è
  // per fantasquadra e poi per giocatore: si legge «cosa ha preso ciascuno»,
  // che è la domanda vera, invece di un elenco piatto da scorrere.
  const gruppi = new Map<number, BustaVinta[]>()
  for (const b of righe) {
    const t = b.turno ?? 1
    if (!gruppi.has(t)) gruppi.set(t, [])
    gruppi.get(t)!.push(b)
  }
  for (const elenco of gruppi.values()) {
    elenco.sort(
      (a, b) =>
        (a.squadre?.nome ?? '').localeCompare(b.squadre?.nome ?? '', 'it') ||
        (a.giocatori?.nome ?? '').localeCompare(b.giocatori?.nome ?? '', 'it')
    )
  }
  const perTurno = [...gruppi.entries()].sort((a, b) => b[0] - a[0])

  return (
    <div className="fm-pagina">
      <h1 className="fm-title mb-1 text-2xl sm:text-3xl">Sommario Buste</h1>
      <p className="mb-5 text-sm text-ink-mid">
        Chi è stato assegnato senza passare dall&apos;asta, di tutte le squadre.
        Le tornate sono numerate come i turni di buste, dalla più recente.
      </p>

      {perTurno.length === 0 ? (
        <div className="fm-alert fm-alert-info">
          Nessun giocatore è ancora stato assegnato con le buste. Qui compariranno
          dopo il primo spoglio.
        </div>
      ) : (
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <span>Assegnati con le buste</span>
            <span className="fm-chip shrink-0">{righe.length}</span>
          </div>

          <div className="fm-panel-body space-y-5">
            {perTurno.map(([turno, elenco]) => (
              <div key={turno}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="fm-chip fm-chip-attivo">Turno {turno}</span>
                  <div className="flex-1 border-t border-line" />
                  <span className="fm-label shrink-0">{elenco.length}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {elenco.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel-hi p-2.5"
                    >
                      <div className="min-w-0">
                        {/* Optional chaining ovunque: una busta orfana non deve
                            far cadere la pagina, come già successo altrove. */}
                        <div className="fm-nome truncate text-base">
                          {b.giocatori?.nome ?? 'Giocatore rimosso'}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-viola-hi">{b.squadre?.nome ?? '—'}</span>
                          <span className="text-ink-dim">·</span>
                          <span className="inline-flex items-center gap-1.5 text-ink-mid">
                            <LogoSquadra squadra={b.giocatori?.squadra} />
                            {b.giocatori?.squadra}
                          </span>
                          <RuoliGiocatore
                            ruolo={b.giocatori?.ruolo}
                            ruoloMantra={b.giocatori?.ruolo_mantra}
                          />
                        </div>
                      </div>
                      <span className="fm-badge fm-badge-good shrink-0">
                        {b.giocatori?.quotazione} cr
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
