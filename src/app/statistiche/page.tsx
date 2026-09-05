import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import StatisticheClient from '@/components/StatisticheClient'
import {
  riassumiLega,
  riassumiRuoli,
  riassumiSquadre,
  type GiocatoreInRosa,
} from '@/utils/statistiche'

export const dynamic = 'force-dynamic'

const NOME_RUOLO: Record<string, string> = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
}

/**
 * Le medie di ogni fantasquadra: età, valore di listino, spesa d'asta.
 *
 * **La trappola che questa pagina esiste per evitare.** In
 * `tesseramenti.prezzo_pagato` convivono due numeri diversi: il prezzo battuto
 * all'asta per chi è stato preso qui, e la colonna "Costo" del file di import
 * per chi è arrivato con la rosa già fatta — che nella lega di oggi è quasi
 * sempre la quotazione. Una "media dei crediti spesi" su tutta la rosa
 * mescola le due cose e restituisce un numero dall'aria sensata che in realtà
 * racconta il listone: oggi sarebbero 350 righe di listino contro 70 di asta
 * vera. Per questo la colonna della spesa conta **solo** i giocatori presi in
 * questa asta.
 *
 * Chi sia "preso in questa asta" non si decide da una data — un confine
 * temporale scritto a mano è un'ipotesi travestita da dato — ma dalle aste
 * chiuse e dalle buste vinte, lo stesso insieme che `/rose` usa per
 * evidenziare i prezzi di riparazione.
 *
 * Pagina server: qui non si scrive niente e non c'è nulla in tempo reale.
 * L'unico pezzo client è la tabella, che si limita a riordinare.
 */
export default async function StatistichePage() {
  await requireUtente()
  const supabase = await createClient()

  const [squadreRes, tessRes, asteRes, busteRes] = await Promise.all([
    supabase
      .from('squadre')
      .select('id, nome, budget_iniziale, crediti_residui')
      .order('nome'),
    // `count: 'exact'` non è decorativo: se PostgREST tronca la risposta, tutte
    // le medie qui sotto restano plausibili e sbagliate. Meglio accorgersene e
    // dirlo che pubblicare numeri parziali.
    supabase
      .from('tesseramenti')
      .select('squadra_id, prezzo_pagato, giocatori(id, nome, eta, ruolo, quotazione)', {
        count: 'exact',
      }),
    // La colonna è `squadra_in_testa`: un'asta chiusa senza nessuno in testa è
    // andata deserta e non ha assegnato niente.
    supabase
      .from('aste')
      .select('giocatore_id')
      .eq('stato', 'CHIUSA')
      .not('squadra_in_testa', 'is', null),
    supabase.from('buste').select('giocatore_id').eq('esito', 'VINTO'),
  ])

  // Prima di qualunque conto: senza squadre o senza tesseramenti le medie
  // sarebbero calcolate su un insieme vuoto e uscirebbero come "—", che si
  // legge "nessun dato" invece che "interrogazione fallita".
  if (squadreRes.error || tessRes.error) {
    return (
      <div className="fm-pagina">
        <div className="fm-alert fm-alert-danger font-semibold">
          Errore nel caricamento delle statistiche:{' '}
          {squadreRes.error?.message ?? tessRes.error?.message}
        </div>
      </div>
    )
  }

  const squadre = (squadreRes.data ?? []).map((s) => ({
    id: s.id,
    nome: s.nome,
    budgetIniziale: s.budget_iniziale,
    creditiResidui: s.crediti_residui,
  }))

  const presiInAsta = new Set<number>([
    ...(asteRes.data ?? []).map((a) => a.giocatore_id),
    ...(busteRes.data ?? []).map((b) => b.giocatore_id),
  ])

  type RigaTesseramento = {
    squadra_id: string
    prezzo_pagato: number
    giocatori: { id: number; nome: string; eta: number | null; ruolo: string; quotazione: number } | null
  }
  const tesseramenti = (tessRes.data ?? []) as unknown as RigaTesseramento[]
  const troncato = tessRes.count !== null && tessRes.count > tesseramenti.length

  const rosa: GiocatoreInRosa[] = tesseramenti
    .filter((t) => t.giocatori !== null)
    .map((t) => ({
      id: t.giocatori!.id,
      nome: t.giocatori!.nome,
      eta: t.giocatori!.eta,
      ruolo: t.giocatori!.ruolo,
      quotazione: t.giocatori!.quotazione,
      prezzoPagato: t.prezzo_pagato,
      squadraId: t.squadra_id,
      presoInAsta: presiInAsta.has(t.giocatori!.id),
    }))

  const righe = riassumiSquadre(squadre, rosa)
  const totali = riassumiLega(rosa)
  const ruoli = riassumiRuoli(rosa)

  return (
    <div className="fm-pagina">
      <h1 className="fm-title mb-1 text-2xl sm:text-3xl">Statistiche</h1>
      <p className="mb-5 text-sm text-ink-mid">
        Come sono fatte le rose della lega: quanto sono giovani, quanto valgono
        a listino e quanto è costato prendersele all&apos;asta.
      </p>

      {troncato && (
        <div className="fm-alert fm-alert-warn mb-4">
          Il database ha restituito {tesseramenti.length} tesseramenti su{' '}
          {tessRes.count}: le medie qui sotto sono calcolate su una parte dei
          dati e non vanno usate.
        </div>
      )}

      {rosa.length === 0 ? (
        <div className="fm-alert fm-alert-info">
          Nessuna rosa da analizzare: le statistiche compaiono dopo l&apos;import
          delle rose o dopo i primi acquisti all&apos;asta.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="fm-metric">
              <p className="fm-metric-label">Età media di lega</p>
              <p className="fm-metric-value">
                {totali.etaMedia !== null ? totali.etaMedia.toFixed(1) : '—'}
              </p>
            </div>
            <div className="fm-metric">
              <p className="fm-metric-label">Quotazione media</p>
              <p className="fm-metric-value">{totali.quotMedia.toFixed(1)}</p>
            </div>
            <div className="fm-metric">
              <p className="fm-metric-label">Spesi in asta</p>
              <p className="fm-metric-value">{totali.spesoInAsta}</p>
            </div>
            <div className="fm-metric">
              <p className="fm-metric-label">Media per acquisto</p>
              <p className="fm-metric-value">
                {totali.mediaAsta !== null ? totali.mediaAsta.toFixed(1) : '—'}
              </p>
            </div>
          </div>

          <StatisticheClient righe={righe} />

          <div className="fm-alert fm-alert-info mt-4">
            <p>
              <strong>Cosa conta la colonna «Spesi in asta».</strong> Solo i{' '}
              {totali.presiInAsta} giocatori presi in questa asta, fra chiamate e
              buste. Gli altri {totali.importati} sono arrivati con l&apos;import
              delle rose: il loro prezzo viene dal file di partenza, non da
              un&apos;offerta, e sommarlo qui darebbe una spesa che nessuno ha
              mai fatto.
            </p>
            <p className="mt-2">
              <strong>«Sul listino»</strong> è quanto si è pagato rispetto alla
              quotazione degli stessi giocatori: 1,00× vuol dire a prezzo di
              listino, 1,30× il trenta per cento sopra. Chi è passato dalle buste
              paga per definizione la quotazione, quindi il valore sale con i
              rilanci dell&apos;asta dal vivo.
            </p>
          </div>

          <div className="fm-panel mt-4 overflow-hidden">
            <div className="fm-panel-head">
              <span>Per reparto, su tutta la lega</span>
            </div>
            <div className="fm-table-scroll">
              <table className="fm-table fm-table-cards">
                <thead>
                  <tr>
                    <th>Reparto</th>
                    <th className="fm-num">In rosa</th>
                    <th className="fm-num">Quot. media</th>
                    <th className="fm-num">Presi in asta</th>
                    <th className="fm-num">Prezzo medio</th>
                    <th className="fm-num">Sul listino</th>
                  </tr>
                </thead>
                <tbody>
                  {ruoli.map((r) => (
                    <tr key={r.ruolo}>
                      <td className="fm-nome">{NOME_RUOLO[r.ruolo] ?? r.ruolo}</td>
                      <td data-label="In rosa" className="fm-num">{r.inRosa}</td>
                      <td data-label="Quot. media" className="fm-num">{r.quotMedia.toFixed(1)}</td>
                      <td data-label="Presi in asta" className="fm-num">{r.presiInAsta}</td>
                      <td data-label="Prezzo medio" className="fm-num">
                        {r.prezzoMedioAsta !== null ? r.prezzoMedioAsta.toFixed(1) : '—'}
                      </td>
                      <td data-label="Sul listino" className="fm-num">
                        {r.rapportoListino !== null ? `${r.rapportoListino.toFixed(2)}×` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
