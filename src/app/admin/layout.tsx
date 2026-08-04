import { requireAdmin } from '@/utils/auth'

/**
 * Gate server-side per tutta l'area /admin.
 *
 * Prima il controllo esisteva solo dentro i componenti client (rendering
 * condizionale di un messaggio "Accesso negato"): la pagina veniva comunque
 * servita e i dati venivano comunque richiesti.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
