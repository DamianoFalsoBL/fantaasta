import { redirect } from 'next/navigation'
import { requireAdmin } from '@/utils/auth'

/**
 * Il conteggio degli slot per squadra vive ora nella tabella di
 * /admin/riepilogo, che quelle stesse squadre le elencava gia': mancava solo
 * il totale accanto agli occupati. Due pagine per lo stesso dato erano due
 * posti da ricordarsi di confrontare.
 *
 * L'indirizzo resta, e resta protetto: se qualcuno lo ha nei preferiti deve
 * ritrovarsi dove il dato e' finito, non davanti a un 404.
 */
export default async function DebugPage() {
  await requireAdmin()
  redirect('/admin/riepilogo')
}
