import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/utils/auth'

export const dynamic = 'force-dynamic'

/**
 * Riepilogo slot per squadra.
 *
 * Era una pagina pubblica che istanziava il client con la service role,
 * bypassando le RLS per chiunque. Ora richiede un admin e usa il client SSR,
 * quindi legge con i permessi dell'utente.
 */
export default async function DebugPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: regole } = await supabase.from('regole_lega').select('slot_totali').limit(1).single()
  const slotTotali = regole?.slot_totali ?? 30

  const { data: squadre, error } = await supabase
    .from('squadre')
    .select('nome, slot_occupati')
    .order('slot_occupati', { ascending: true })

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
      <h1 className="fm-title mb-4 text-2xl sm:text-3xl">Slot per squadra</h1>

      {error && <div className="fm-alert fm-alert-danger mb-4 font-semibold">Errore: {error.message}</div>}
      {!error && (!squadre || squadre.length === 0) && (
        <div className="fm-panel p-6 text-center text-ink-mid">Nessuna squadra trovata nel database.</div>
      )}

      {squadre && squadre.length > 0 && (
        <ul className="fm-panel divide-y divide-line overflow-hidden">
          {squadre.map((s) => {
            const occupati = s.slot_occupati ?? 0
            return (
              <li key={s.nome} className="flex items-center justify-between px-3 py-2">
                <span className="fm-nome">{s.nome}</span>
                <span className={`fm-badge ${occupati < slotTotali ? 'fm-badge-mid' : 'fm-badge-top'}`}>
                  {occupati} / {slotTotali}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
