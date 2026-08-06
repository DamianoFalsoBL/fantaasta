import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import MantraBadge from '@/components/MantraBadge'
import { isAdminRole, requireUtente } from '@/utils/auth'

export default async function RosePage() {
  const profilo = await requireUtente()
  const isAdmin = isAdminRole(profilo.ruolo)
  const supabase = await createClient()

  // Recupera tutte le squadre con i loro tesseramenti
  const { data: squadre, error } = await supabase
    .from('squadre')
    .select(`
      *,
      tesseramenti (
        prezzo_pagato,
        giocatori (
          id,
          nome,
          ruolo,
          squadra,
          eta,
          ruolo_mantra
        )
      )
    `)
    .order('nome')

  const { data: regole } = await supabase.from('regole_lega').select('slot_totali').limit(1).maybeSingle();
  const slotTotali = regole?.slot_totali ?? 30;

  const { data: busteVinte } = await supabase.from('buste').select('giocatore_id').eq('esito', 'VINTO');
  // La colonna è `squadra_in_testa`: `vincitore_id` non esiste, quindi questa
  // query falliva sempre e l'errore non veniva mai controllato.
  const { data: asteVinte } = await supabase
    .from('aste')
    .select('giocatore_id')
    .eq('stato', 'CHIUSA')
    .not('squadra_in_testa', 'is', null);

  const giocatoriRiparazione = new Set([
    ...(busteVinte?.map(b => b.giocatore_id) || []),
    ...(asteVinte?.map(a => a.giocatore_id) || [])
  ]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="fm-alert fm-alert-danger font-semibold">
          Errore caricamento rose: {error.message}
        </div>
      </div>
    )
  }

  // Ordine dei ruoli
  const ruoloOrder = { 'P': 1, 'D': 2, 'C': 3, 'A': 4 }

  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="fm-title text-2xl sm:text-3xl">Rose squadre</h1>
          <div className="flex gap-2">
             <Link href="/asta" className="fm-btn fm-btn-ghost">
               Torna al tabellone
             </Link>
             {isAdmin && (
               <Link href="/admin/riepilogo" className="fm-btn fm-btn-ghost">
                 Riepilogo admin
               </Link>
             )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {squadre?.map((squadra) => {
            // Raggruppa i giocatori per ruolo e ordinali
            const giocatori = squadra.tesseramenti
              .map((t: any) => ({
                ...t.giocatori,
                prezzo_pagato: t.prezzo_pagato
              }))
              .sort((a: any, b: any) => (ruoloOrder[a.ruolo as keyof typeof ruoloOrder] || 99) - (ruoloOrder[b.ruolo as keyof typeof ruoloOrder] || 99))

            return (
              <div key={squadra.id} className="fm-panel overflow-hidden">
                <div className="fm-panel-head fm-panel-head--neon">
                  <span className="truncate">{squadra.nome}</span>
                  <span className="shrink-0 text-right">
                    <span className="fm-label block leading-none">Crediti</span>
                    <span className="text-xl font-bold tabular-nums leading-tight text-neon">{squadra.crediti_residui}</span>
                  </span>
                </div>

                <div className="flex justify-between border-b border-line bg-panel-hi px-3 py-2">
                  <span className="fm-label">Slot {squadra.slot_occupati}/{slotTotali}</span>
                  <span className="fm-label">Spesa {squadra.budget_iniziale - squadra.crediti_residui}</span>
                </div>

                <div className="p-2">
                  {giocatori.length === 0 ? (
                    <div className="py-8 text-center text-sm text-ink-dim">Nessun giocatore acquistato</div>
                  ) : (
                    <ul className="divide-y divide-line">
                      {giocatori.map((g: any, i: number) => {
                        const isRiparazione = giocatoriRiparazione.has(g.id);
                        return (
                        <li key={i} className={`flex items-center justify-between gap-2 rounded-sm px-1.5 py-1.5 ${isRiparazione ? 'bg-panel-hi' : ''}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            {/* La mappa ruolo->colore duplicava quella di MantraBadge
                                con una palette diversa, e le due finivano sulla
                                stessa riga. Ora usano lo stesso vocabolario. */}
                            <span className={`fm-badge shrink-0 ${
                              g.ruolo === 'P' ? 'fm-badge-mid' :
                              g.ruolo === 'D' ? 'fm-badge-top' :
                              g.ruolo === 'C' ? 'fm-badge-good' :
                              'fm-badge-bad'
                            }`}>
                              {g.ruolo}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="fm-nome truncate">{g.nome}</span>
                                {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
                              </div>
                              <div className="fm-label truncate">{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</div>
                            </div>
                          </div>
                          <div className={`shrink-0 font-bold tabular-nums ${isRiparazione ? 'text-viola-hi' : 'text-ink'}`}>
                            {g.prezzo_pagato} <span className="text-xs font-normal text-ink-dim">cr</span>
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
