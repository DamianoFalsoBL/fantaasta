import { createClient } from '@/utils/supabase/server'
import SvincolatiClient from './SvincolatiClient'
import { requireUtente } from '@/utils/auth'
import { idsInCodaAsta } from '@/utils/giocatori'
import { leggiPreferiti } from '@/utils/preferiti'

export const dynamic = 'force-dynamic'

export default async function SvincolatiPage() {
  const profilo = await requireUtente()
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

  // I preferiti si leggono qui e non nel client: sono già una query di questa
  // pagina, e passarli come dati iniziali evita che la stella compaia spenta
  // per un istante e poi si accenda.
  //
  // Si contano PRIMA di togliere chi non è più disponibile, perché la
  // differenza fra i due numeri è l'avviso che serve al manager: un preferito
  // finito in coda per l'asta sparirebbe dall'elenco senza dire niente, e lui
  // crederebbe di averne dieci quando ne ha otto.
  const preferiti = profilo.squadra_id ? await leggiPreferiti(supabase) : []
  const idsDisponibili = new Set(disponibili.map((g) => g.id))
  const preferitiVisibili = preferiti.filter((id) => idsDisponibili.has(id))

  return (
    <main>
      <div className="fm-pagina">
        {/* Stessa intestazione di ogni altra pagina: titolo a sinistra fuori
            dal pannello. Prima stava dentro una `fm-panel-head`, che e' la
            testata di un riquadro e non il titolo di una pagina: si leggeva
            piu' piccola, in maiuscolo, e finiva pure fuori asse. */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="fm-title text-2xl sm:text-3xl">Lista svincolati</h1>
            <p className="mt-1 text-sm text-ink-mid">
              I giocatori ancora disponibili per essere acquistati.
            </p>
          </div>
          <span className="fm-chip shrink-0">{disponibili.length}</span>
        </div>

        <SvincolatiClient
          giocatori={disponibili}
          squadraId={profilo.squadra_id}
          preferitiIniziali={preferitiVisibili}
          preferitiNonDisponibili={preferiti.length - preferitiVisibili.length}
        />
      </div>
    </main>
  )
}
