import { createClient } from '@/utils/supabase/server'
import SvincolatiClient from './SvincolatiClient'
import { requireUtente } from '@/utils/auth'
import { idsInCodaAsta } from '@/utils/giocatori'

export const dynamic = 'force-dynamic'

export default async function SvincolatiPage() {
  await requireUtente()
  const supabase = await createClient()

  // I giocatori marcati "Fuori lista" nel listone non sono acquistabili.
  const { data: giocatori } = await supabase
    .from('giocatori')
    .select('*')
    .eq('stato', 'LIBERO')
    .eq('fuori_lista', false)
    .order('nome')

  // Lo stato 'LIBERO' non basta a dire "prendibile": un conteso resta libero
  // fino alla chiusura della sua asta, e comparendo qui faceva credere
  // disponibile qualcuno che invece è già in coda. Chi sfoglia questa pagina
  // per preparare la tornata di buste successiva ci si sarebbe basato sopra.
  const inCoda = await idsInCodaAsta(supabase)
  const disponibili = (giocatori ?? []).filter((g) => !inCoda.has(g.id))

  return (
    <main className="py-6 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <div>
              <h1 className="fm-title text-xl">Lista svincolati</h1>
              <p className="mt-0.5 text-xs font-normal normal-case tracking-normal text-ink-dim">
                I giocatori ancora disponibili per essere acquistati.
              </p>
            </div>
            <span className="fm-chip shrink-0">{disponibili.length}</span>
          </div>

          <SvincolatiClient giocatori={disponibili} />
        </div>
      </div>
    </main>
  )
}
