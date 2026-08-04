import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import AsteClient, { type RigaAsta } from './AsteClient'

export const dynamic = 'force-dynamic'

type RigaLista = {
  giocatore_id: number
  squadre: { id: string; nome: string } | null
  giocatori: {
    id: number
    nome: string
    ruolo: string
    ruolo_mantra: string[] | null
    eta: number | null
    squadra: string | null
    quotazione: number
    stato: string
  } | null
}

export default async function AstePage() {
  const profilo = await requireUtente()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('liste_aste')
    .select('giocatore_id, squadre(id, nome), giocatori(id, nome, ruolo, ruolo_mantra, eta, squadra, quotazione, stato)')

  const righe = (data ?? []) as unknown as RigaLista[]

  // Una riga per giocatore, con l'elenco delle squadre che lo hanno in lista.
  const perGiocatore = new Map<number, RigaAsta>()
  let concluse = 0
  for (const r of righe) {
    if (!r.giocatori) continue
    // Le aste già concluse finiscono nello storico: qui restano solo quelle
    // ancora da giocare. `chiudi_asta` ripulisce liste_aste, ma un giocatore
    // può risultare tesserato anche per altre vie (buste, import rose).
    if (r.giocatori.stato === 'TESSERATO') {
      if (!perGiocatore.has(r.giocatore_id)) concluse++
      continue
    }
    const esistente = perGiocatore.get(r.giocatore_id)
    const nomeSquadra = r.squadre?.nome
    if (esistente) {
      if (nomeSquadra) esistente.contendenti.push(nomeSquadra)
      if (r.squadre?.id === profilo.squadra_id) esistente.inMiaLista = true
    } else {
      perGiocatore.set(r.giocatore_id, {
        id: r.giocatori.id,
        nome: r.giocatori.nome,
        ruolo: r.giocatori.ruolo,
        ruolo_mantra: r.giocatori.ruolo_mantra,
        eta: r.giocatori.eta,
        squadra: r.giocatori.squadra,
        quotazione: r.giocatori.quotazione,
        contendenti: nomeSquadra ? [nomeSquadra] : [],
        inMiaLista: r.squadre?.id === profilo.squadra_id,
      })
    }
  }

  const ordineRuolo: Record<string, number> = { P: 1, D: 2, C: 3, A: 4 }
  const lista = [...perGiocatore.values()].sort((a, b) => {
    // I più contesi in cima: è l'informazione che serve per preparare l'asta.
    if (b.contendenti.length !== a.contendenti.length) return b.contendenti.length - a.contendenti.length
    const dr = (ordineRuolo[a.ruolo] ?? 9) - (ordineRuolo[b.ruolo] ?? 9)
    if (dr !== 0) return dr
    return b.quotazione - a.quotazione
  })

  lista.forEach((r) => r.contendenti.sort((a, b) => a.localeCompare(b)))

  return (
    <main className="py-6 sm:py-8">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="fm-panel overflow-hidden">
          <div className="fm-panel-head">
            <div>
              <h1 className="fm-title text-xl">Aste a chiamata</h1>
              <p className="mt-0.5 text-xs font-normal normal-case tracking-normal text-ink-dim">
                I giocatori ancora da assegnare, con chi se li contende.
                {concluse > 0 && ` ${concluse} già aggiudicati sono nello storico.`}
              </p>
            </div>
          </div>

          {error ? (
            <div className="p-4">
              <div className="fm-alert fm-alert-danger font-semibold">
                Errore nel caricamento delle liste: {error.message}
              </div>
            </div>
          ) : (
            <AsteClient righe={lista} />
          )}
        </div>
      </div>
    </main>
  )
}
