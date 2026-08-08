'use client'

import { useMemo, useState } from 'react'
import MantraBadge from '@/components/MantraBadge'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import { mantraPresenti, ruoloCorrisponde } from '@/utils/ruoli'

export type RigaAsta = {
  id: number
  nome: string
  ruolo: string
  ruolo_mantra: string[] | null
  eta: number | null
  squadra: string | null
  quotazione: number
  contendenti: string[]
  inMiaLista: boolean
}

/** Un'asta gia' chiusa e aggiudicata. Veniva dalla pagina /storico. */
export type RigaStorico = {
  id: string
  nome: string
  ruolo: string
  ruolo_mantra: string[] | null
  eta: number | null
  fantasquadra: string
  prezzo: number
  quando: string
}

export default function AsteClient({
  righe,
  storico,
  erroreStorico,
}: {
  righe: RigaAsta[]
  storico: RigaStorico[]
  erroreStorico: string | null
}) {
  const [nome, setNome] = useState('')
  const [ruolo, setRuolo] = useState('')
  const [squadraFanta, setSquadraFanta] = useState('')
  const [soloContesi, setSoloContesi] = useState(false)
  const [soloMie, setSoloMie] = useState(false)
  // Le due meta' della stessa domanda, una accanto all'altra.
  const [scheda, setScheda] = useState<'aperte' | 'assegnati'>('aperte')

  const ruoliMantra = useMemo(() => mantraPresenti(righe), [righe])

  const squadreFanta = useMemo(() => {
    const s = new Set<string>()
    righe.forEach((r) => r.contendenti.forEach((c) => s.add(c)))
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [righe])

  const filtrate = useMemo(() => {
    return righe.filter((r) => {
      if (nome && !r.nome.toLowerCase().includes(nome.toLowerCase())) return false
      if (!ruoloCorrisponde(ruolo, r.ruolo, r.ruolo_mantra)) return false
      if (squadraFanta && !r.contendenti.includes(squadraFanta)) return false
      if (soloContesi && r.contendenti.length < 2) return false
      if (soloMie && !r.inMiaLista) return false
      return true
    })
  }, [righe, nome, ruolo, squadraFanta, soloContesi, soloMie])

  const contesi = righe.filter((r) => r.contendenti.length > 1).length
  const spesaPotenziale = filtrate.reduce((s, r) => s + r.quotazione, 0)

  const spesaTotale = storico.reduce((s, r) => s + r.prezzo, 0)

  return (
    <div className="p-3 sm:p-4">

      {/* Le due schede. Sono pulsanti e non collegamenti perche' i dati
          arrivano gia' tutti insieme dal server: cambiare scheda non deve
          costare un giro di rete. */}
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {([
          ['aperte', 'Da assegnare', righe.length],
          ['assegnati', 'Assegnati', storico.length],
        ] as const).map(([chiave, etichetta, quanti]) => (
          <button
            key={chiave}
            type="button"
            role="tab"
            aria-selected={scheda === chiave}
            onClick={() => setScheda(chiave)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              scheda === chiave
                ? 'border-neon text-neon'
                : 'border-transparent text-ink-mid hover:text-ink'
            }`}
          >
            {etichetta} <span className="fm-label">{quanti}</span>
          </button>
        ))}
      </div>

      {scheda === 'assegnati' ? (
        <SchedaAssegnati righe={storico} errore={erroreStorico} spesaTotale={spesaTotale} />
      ) : (
      <>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metrica etichetta="Giocatori in lista" valore={righe.length} />
        <Metrica etichetta="Contesi" valore={contesi} accento />
        {/* Non "senza contendenti": ogni riga di liste_aste ha almeno una
            squadra, quindi il contendente c'è sempre. Questi sono i giocatori
            richiesti da una sola squadra, cioè quelli che non finiranno in gara. */}
        <Metrica etichetta="Non contesi" valore={righe.length - contesi} />
        <Metrica etichetta="Valore base mostrato" valore={`${spesaPotenziale} cr`} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-md border border-line bg-panel-hi p-3 md:grid-cols-3">
        <div>
          <label htmlFor="a-nome" className="fm-label mb-1 block">Cerca per nome</label>
          <input
            id="a-nome"
            type="text"
            placeholder="Es. Salah…"
            className="fm-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="a-ruolo" className="fm-label mb-1 block">Ruolo</label>
          <select
            id="a-ruolo"
            className="fm-select"
            value={ruolo}
            onChange={(e) => setRuolo(e.target.value)}
          >
            <OpzioniRuolo presenti={ruoliMantra} />
          </select>
        </div>
        <div>
          <label htmlFor="a-fanta" className="fm-label mb-1 block">Fantasquadra</label>
          <select
            id="a-fanta"
            className="fm-select"
            value={squadraFanta}
            onChange={(e) => setSquadraFanta(e.target.value)}
          >
            <option value="">Tutte le fantasquadre</option>
            {squadreFanta.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-4 md:col-span-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-mid">
            <input type="checkbox" className="rounded" checked={soloContesi} onChange={(e) => setSoloContesi(e.target.checked)} />
            Solo giocatori contesi
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-ink-mid">
            <input type="checkbox" className="rounded" checked={soloMie} onChange={(e) => setSoloMie(e.target.checked)} />
            Solo quelli nella mia lista
          </label>
        </div>
      </div>

      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruoli</th>
              {/* Niente `fm-num`: allineava a destra due sole colonne in mezzo
                  alle altre, spezzando la colonna del testo. Le cifre restano
                  tabulari, così incolonnano lo stesso. Stessa scelta fatta in
                  /svincolati. */}
              <th>Età</th>
              <th>Squadra</th>
              <th>Prezzo</th>
              <th>Conteso tra</th>
            </tr>
          </thead>
          <tbody>
            {filtrate.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-dim">
                  Nessun giocatore in lista con questi filtri.
                </td>
              </tr>
            ) : (
              filtrate.map((r) => (
                <tr key={r.id} className={r.inMiaLista ? 'fm-row-mia' : undefined}>
                  <td data-label="Nome" className="fm-nome">
                    <span className="flex items-center gap-2">
                      {r.nome}
                      {r.inMiaLista && <span className="fm-badge fm-badge-top">Tua</span>}
                    </span>
                  </td>
                  <td data-label="Ruoli">
                    <span className="flex items-center justify-end gap-2 md:justify-start">
                      <span className="text-ink-mid">{r.ruolo}</span>
                      {r.ruolo_mantra && r.ruolo_mantra.length > 0 && <MantraBadge ruoli={r.ruolo_mantra} />}
                    </span>
                  </td>
                  <td data-label="Età" className="tabular-nums text-ink-mid">{r.eta ? String(r.eta) : '—'}</td>
                  <td data-label="Squadra" className="text-ink-mid">{r.squadra ?? '—'}</td>
                  <td data-label="Prezzo" className="tabular-nums">
                    <span className="fm-badge fm-badge-good">{r.quotazione}</span>
                  </td>
                  <td data-label="Conteso tra">
                    {r.contendenti.length > 1 ? (
                      <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
                        {r.contendenti.map((c) => (
                          <span key={c} className="fm-chip">{c}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="fm-chip fm-chip-neon">
                        Solo {r.contendenti[0] ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-right">
        <span className="fm-label">Mostrati {filtrate.length} di {righe.length}</span>
      </div>
      </>
      )}
    </div>
  )
}

function Metrica({ etichetta, valore, accento }: { etichetta: string; valore: string | number; accento?: boolean }) {
  return (
    <div className="fm-metric">
      <div className="fm-metric-label">{etichetta}</div>
      <div className={`fm-metric-value ${accento ? 'fm-metric-value--neon' : ''}`}>{valore}</div>
    </div>
  )
}

/**
 * Le aste gia' aggiudicate. Era la pagina /storico, ora una scheda qui.
 */
function SchedaAssegnati({
  righe, errore, spesaTotale,
}: { righe: RigaStorico[]; errore: string | null; spesaTotale: number }) {
  if (errore) {
    return (
      <div className="fm-alert fm-alert-danger font-semibold">
        Errore nel caricamento dello storico: {errore}
      </div>
    )
  }

  if (righe.length === 0) {
    return <div className="py-10 text-center text-ink-mid">Non è stata ancora assegnata alcuna asta.</div>
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Metrica etichetta="Assegnazioni" valore={righe.length} />
        <Metrica etichetta="Speso in asta" valore={`${spesaTotale} cr`} accento />
      </div>

      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards">
          <thead>
            <tr>
              <th scope="col">Calciatore</th>
              <th scope="col">Ruoli</th>
              <th scope="col">Fantasquadra</th>
              <th scope="col">Prezzo</th>
              <th scope="col">Data</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id}>
                <td data-label="Calciatore" className="fm-nome">
                  <span className="flex items-center gap-2">
                    {r.nome}
                    {r.eta ? <span className="fm-label">{r.eta}</span> : null}
                  </span>
                </td>
                <td data-label="Ruoli">
                  <span className="flex items-center justify-end gap-2 md:justify-start">
                    <span className="text-ink-mid">{r.ruolo}</span>
                    {r.ruolo_mantra && r.ruolo_mantra.length > 0 && <MantraBadge ruoli={r.ruolo_mantra} />}
                  </span>
                </td>
                <td data-label="Fantasquadra" className="font-semibold text-viola-hi">{r.fantasquadra}</td>
                <td data-label="Prezzo" className="tabular-nums">
                  <span className="fm-badge fm-badge-top">{r.prezzo}</span>
                </td>
                {/* Niente `whitespace-nowrap`: la data in formato italiano è la
                    cella più larga, e lasciarla andare a capo è ciò che toglie
                    lo sforamento su schermo stretto. */}
                <td data-label="Data" className="text-ink-dim">
                  {new Date(r.quando).toLocaleString('it-IT')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
