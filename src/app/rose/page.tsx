import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import MantraBadge from '@/components/MantraBadge'
import { indiceMantra } from '@/utils/ruoli'
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
      <div className="fm-pagina">
        <div className="fm-alert fm-alert-danger font-semibold">
          Errore caricamento rose: {error.message}
        </div>
      </div>
    )
  }

  // Ordine dei ruoli
  /**
   * Il reparto classico resta la chiave principale, e i ruoli Mantra ordinano
   * dentro di esso.
   *
   * Non si ordina per solo ruolo Mantra perche' gli slot di una rosa si contano
   * per reparto: misurati sul listone, 18 giocatori su 549 hanno il reparto in
   * disaccordo con la linea del loro ruolo Mantra piu' arretrato — Dimarco e'
   * un difensore che gioca E, Neres un attaccante che gioca W. Ordinando per
   * solo Mantra finirebbero in mezzo ai centrocampisti, dove chi conta i
   * difensori non li cerca.
   *
   * Sui restanti 531 le due strade danno lo stesso risultato, perche' la
   * leggenda Mantra e' gia' ordinata per linee.
   */
  const ruoloOrder = { 'P': 1, 'D': 2, 'C': 3, 'A': 4 }

  return (
    <div className="fm-pagina">

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
              .sort((a: any, b: any) =>
                (ruoloOrder[a.ruolo as keyof typeof ruoloOrder] || 99) - (ruoloOrder[b.ruolo as keyof typeof ruoloOrder] || 99)
                || indiceMantra(a.ruolo_mantra) - indiceMantra(b.ruolo_mantra)
                || a.nome.localeCompare(b.nome, 'it'))

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
                        /* Tre colonne di larghezza fissa, uguali per tutte le
                           righe e per tutte le squadre: è l'unico modo di far
                           combaciare i ruoli e i prezzi da una riga all'altra,
                           perché una traccia `auto` si dimensiona su ogni riga
                           per conto suo.

                           5.9rem sono i 90px che servono a tre pastiglie
                           Mantra, misurati; 3.9rem bastano a "127 cr", cioè al
                           budget iniziale più alto della lega — oggi il prezzo
                           più alto pagato è 63, ma la colonna deve reggere il
                           caso limite e non quello capitato finora. */
                        <li key={i} className={`grid items-center gap-2 rounded-sm px-1.5 py-1.5 ${isRiparazione ? 'bg-panel-hi' : ''}`}
                            style={{ gridTemplateColumns: 'minmax(0, 1fr) 5.9rem 3.9rem' }}>
                          <div className="min-w-0">
                            {/* Via la pastiglia del reparto che stava prima del
                                nome: P/D/C/A ripeteva quello che i ruoli Mantra
                                dicono già — Por implica P, Dc implica D. */}
                            <div className="fm-nome truncate">{g.nome}</div>
                            <div className="fm-label truncate">{g.squadra}{g.eta ? ` · ${g.eta}` : ''}</div>
                          </div>
                          {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
                          <div className={`text-right font-bold tabular-nums ${isRiparazione ? 'text-viola-hi' : 'text-ink'}`}>
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
  )
}
