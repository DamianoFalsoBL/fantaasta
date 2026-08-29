'use client'

import { useMemo, useState } from 'react'
import RuoliGiocatore from '@/components/RuoliGiocatore'
import LogoSquadra from '@/components/LogoSquadra'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import PannelloFiltri from '@/components/PannelloFiltri'
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

  // Quanti filtri sono attivi oltre la ricerca: è il numero sul pulsante che
  // apre il pannello sul telefono.
  const filtriAttivi =
    (ruolo ? 1 : 0) + (squadraFanta ? 1 : 0) + (soloContesi ? 1 : 0) + (soloMie ? 1 : 0)

  const azzeraFiltri = () => {
    setRuolo('')
    setSquadraFanta('')
    setSoloContesi(false)
    setSoloMie(false)
  }

  const contesi = righe.filter((r) => r.contendenti.length > 1).length

  // "Non contesi" e "Valore base mostrato" sono stati tolti: in questa lista
  // finiscono solo i giocatori contesi — `admin_elabora_buste` manda in
  // liste_aste unicamente chi ha più di una richiesta — quindi il primo era
  // uno zero fisso e il secondo un totale che nessuno usava per decidere.
  // Il caso del richiedente unico, se mai arriva dall'import del file aste,
  // resta visibile lo stesso: la riga porta la pastiglia "Solo <squadra>".

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
      {/* Sul telefono i quattro riquadri si prendevano un sesto dello schermo
          prima di qualunque contenuto, e sopra ci stavano anche i filtri: il
          primo giocatore finiva oltre metà pagina. Qui gli stessi numeri
          stanno in una riga, e i riquadri restano dove c'è spazio. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-mid md:hidden">
        <span className="font-semibold tabular-nums text-ink">{righe.length}</span> in lista
        <span className="text-ink-dim">·</span>
        <span className="font-semibold tabular-nums text-neon">{contesi}</span> contesi
      </div>

      <div className="mb-4 hidden grid-cols-2 gap-2 md:grid">
        <Metrica etichetta="Giocatori in lista" valore={righe.length} />
        <Metrica etichetta="Contesi" valore={contesi} accento />
      </div>

      <PannelloFiltri
        attivi={filtriAttivi}
        onAzzera={azzeraFiltri}
        ricerca={
          <>
            {/* Sul telefono l'etichetta resta solo per i lettori di schermo: il
                segnaposto dice gia' cosa ci va, e ventiquattro pixel in cima
                sono una riga di lista in fondo. */}
            <label htmlFor="a-nome" className="fm-label mb-1 block max-md:sr-only">Cerca per nome</label>
            <input
              id="a-nome"
              type="text"
              placeholder="Es. Salah…"
              className="fm-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </>
        }
      >
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
      </PannelloFiltri>

      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards fm-table-compatta">
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
                  <td data-label="Ruoli" className="fm-meta">
                    {/* `inline-flex` e non `flex`: dentro una cella `inline` un
                        figlio di tipo blocco spezzerebbe la riga compatta. */}
                    <span className="inline-flex items-center gap-2 align-middle">
                      <RuoliGiocatore ruolo={r.ruolo} ruoloMantra={r.ruolo_mantra} />
                    </span>
                  </td>
                  <td data-label="Età" className="fm-meta tabular-nums text-ink-mid">
                    {r.eta ? <>{r.eta}<span className="md:hidden"> anni</span></> : '—'}
                  </td>
                  <td data-label="Squadra" className="fm-meta text-ink-mid">
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <LogoSquadra squadra={r.squadra} />
                      {r.squadra ?? '—'}
                    </span>
                  </td>
                  <td data-label="Prezzo" className="fm-meta tabular-nums">
                    <span className="fm-badge fm-badge-good align-middle">
                      {r.quotazione}<span className="md:hidden">&nbsp;cr</span>
                    </span>
                  </td>
                  {/* `fm-piena` e non `fm-meta`: i contendenti sono l'unica
                      informazione che questa pagina porta e che l'app ufficiale
                      non ha, quindi si prendono una riga tutta loro invece di
                      essere troncati con un "+N". */}
                  <td data-label="Conteso tra" className="fm-piena">
                    {r.contendenti.length > 1 ? (
                      <span className="flex flex-wrap gap-1.5">
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
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-mid md:hidden">
        <span className="font-semibold tabular-nums text-ink">{righe.length}</span> assegnazioni
        <span className="text-ink-dim">·</span>
        <span className="font-semibold tabular-nums text-neon">{spesaTotale} cr</span> spesi in asta
      </div>

      <div className="mb-4 hidden grid-cols-2 gap-2 md:grid">
        <Metrica etichetta="Assegnazioni" valore={righe.length} />
        <Metrica etichetta="Speso in asta" valore={`${spesaTotale} cr`} accento />
      </div>

      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards fm-table-compatta">
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
                <td data-label="Ruoli" className="fm-meta">
                  <span className="inline-flex items-center gap-2 align-middle">
                    <RuoliGiocatore ruolo={r.ruolo} ruoloMantra={r.ruolo_mantra} />
                  </span>
                </td>
                <td data-label="Fantasquadra" className="fm-meta font-semibold text-viola-hi">{r.fantasquadra}</td>
                <td data-label="Prezzo" className="fm-meta tabular-nums">
                  <span className="fm-badge fm-badge-top align-middle">{r.prezzo}<span className="md:hidden">&nbsp;cr</span></span>
                </td>
                {/* Niente `whitespace-nowrap`: la data in formato italiano è la
                    cella più larga, e lasciarla andare a capo è ciò che toglie
                    lo sforamento su schermo stretto. */}
                <td data-label="Data" className="fm-meta text-ink-dim">
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
