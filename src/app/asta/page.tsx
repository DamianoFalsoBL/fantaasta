import { redirect } from 'next/navigation'
import TabelloneAsta from '@/components/TabelloneAsta'
import { isAdminRole, requireUtente } from '@/utils/auth'

export default async function AstaLivePage() {
  const profilo = await requireUtente()

  if (profilo.ruolo === 'SUPER_ADMIN') {
    redirect('/admin/setup')
  }

  const squadraId = profilo.squadra_id
  const isAdmin = isAdminRole(profilo.ruolo)

  return (
    // Niente `min-h-screen`: dentro un <main flex-1> sotto un <body min-h-full>
    // forzava l'altezza del viewport PIÙ la navbar, lasciando ~64px di scroll
    // fantasma su ogni pagina.
    <div className="px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="fm-title text-2xl sm:text-3xl">Asta Live</h1>
          {squadraId && <span className="fm-chip">Sei in gara come manager</span>}
        </div>

        {/* Componente Client per Supabase Realtime */}
        <TabelloneAsta squadraId={squadraId} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
