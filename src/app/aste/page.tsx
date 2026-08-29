import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import AsteClient, { type RigaAsta, type RigaStorico } from './AsteClient'

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

  // Lo storico viveva in una pagina a sé. Sono le due metà della stessa
  // domanda — cosa resta e cosa è già andato — e per confrontarle bisognava
  // cambiare pagina proprio nel momento in cui servono insieme.
  const { data: chiuse, error: erroreStorico } = await supabase
    .from('aste')
    .select('id, prezzo_corrente, created_at, scadenza_corrente, squadre!squadra_in_testa(nome), giocatori(nome, ruolo, ruolo_mantra, eta)')
    .eq('stato', 'CHIUSA')
    .not('squadra_in_testa', 'is', null)
    .order('created_at', { ascending: false })

  const storico: RigaStorico[] = (chiuse ?? []).map((a) => {
    const riga = a as unknown as {
      id: string
      prezzo_corrente: number
      created_at: string
      scadenza_corrente: string | null
      squadre: { nome: string } | null
      giocatori: { nome: string; ruolo: string; ruolo_mantra: string[] | null; eta: number | null } | null
    }
    return {
      id: riga.id,
      nome: riga.giocatori?.nome ?? 'Giocatore rimosso',
      ruolo: riga.giocatori?.ruolo ?? '',
      ruolo_mantra: riga.giocatori?.ruolo_mantra ?? null,
      eta: riga.giocatori?.eta ?? null,
      fantasquadra: riga.squadre?.nome ?? '—',
      prezzo: riga.prezzo_corrente,
      // La data mostrata è quella della chiusura, non della creazione.
      quando: riga.scadenza_corrente ?? riga.created_at,
    }
  })

  // Una riga per giocatore, con l'elenco delle squadre che lo hanno in lista.
  const perGiocatore = new Map<number, RigaAsta>()
  for (const r of righe) {
    if (!r.giocatori) continue
    // Chi è già tesserato compare nella scheda "Assegnati" e non qui.
    // `chiudi_asta` ripulisce liste_aste, ma un giocatore può risultare
    // tesserato anche per altre vie (buste, import rose).
    if (r.giocatori.stato === 'TESSERATO') continue
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
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h1 className="fm-title text-2xl sm:text-3xl">Sommario aste</h1>
          <p className="mt-1 text-sm text-ink-mid">
            Chi resta da assegnare e chi è già stato aggiudicato.
          </p>
        </div>

        <div>

          {error ? (
            <div className="p-4">
              <div className="fm-alert fm-alert-danger font-semibold">
                Errore nel caricamento delle liste: {error.message}
              </div>
            </div>
          ) : (
            <AsteClient
              righe={lista}
              storico={storico}
              erroreStorico={erroreStorico?.message ?? null}
            />
          )}
        </div>
      </div>
    </main>
  )
}
