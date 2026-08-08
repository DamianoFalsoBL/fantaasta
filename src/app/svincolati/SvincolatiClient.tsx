'use client'
import { useState, useMemo } from 'react'
import MantraBadge from '@/components/MantraBadge'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import { mantraPresenti, ruoloCorrisponde } from '@/utils/ruoli'

type Colonna = 'nome' | 'ruolo' | 'squadra' | 'eta' | 'quotazione'
type Verso = 'asc' | 'desc'

// Le colonne di testo partono da A-Z, quelle numeriche dal valore più alto:
// è l'ordine che si cerca davvero aprendo una classifica. La freccia mostra
// sempre il verso corrente, quindi non c'è nulla da indovinare.
const VERSO_INIZIALE: Record<Colonna, Verso> = {
  nome: 'asc', ruolo: 'asc', squadra: 'asc', eta: 'asc', quotazione: 'desc',
}

const INTESTAZIONI: { colonna: Colonna; etichetta: string }[] = [
  { colonna: 'nome', etichetta: 'Nome' },
  { colonna: 'ruolo', etichetta: 'Ruoli' },
  { colonna: 'squadra', etichetta: 'Squadra' },
  { colonna: 'eta', etichetta: 'Età' },
  { colonna: 'quotazione', etichetta: 'Quotazione' },
]

// I reparti si ordinano dalla porta all'attacco, non alfabeticamente: A, C, D, P
// non vuol dire niente per chi guarda una rosa.
const PESO_RUOLO: Record<string, number> = { P: 1, D: 2, C: 3, A: 4 }

export default function SvincolatiClient({ giocatori }: { giocatori: any[] }) {
  const [searchNome, setSearchNome] = useState('')
  const [searchSquadra, setSearchSquadra] = useState('')
  const [searchRuolo, setSearchRuolo] = useState('')
  const [searchEta, setSearchEta] = useState('')
  // Il valore iniziale non è una scelta: è l'ordine con cui la pagina server
  // consegna già i dati (`.order('nome')`), così l'aspetto non cambia da solo.
  const [colonna, setColonna] = useState<Colonna>('nome')
  const [verso, setVerso] = useState<Verso>('asc')

  const ordinaPer = (c: Colonna) => {
    if (c === colonna) setVerso(verso === 'asc' ? 'desc' : 'asc')
    else { setColonna(c); setVerso(VERSO_INIZIALE[c]) }
  }

  // Estrai tutte le squadre uniche per il filtro
  const squadreUniche = useMemo(() => {
    const sq = new Set(giocatori.map(g => g.squadra).filter(Boolean))
    return Array.from(sq).sort()
  }, [giocatori])

  // Solo i ruoli Mantra: i quattro reparti sono fissi e li elenca OpzioniRuolo.
  const ruoliMantra = useMemo(() => mantraPresenti(giocatori), [giocatori])

  // Filtra i giocatori
  const giocatoriFiltrati = useMemo(() => {
    return giocatori.filter(g => {
      const matchNome = g.nome.toLowerCase().includes(searchNome.toLowerCase())
      const matchSquadra = searchSquadra === '' || g.squadra === searchSquadra
      
      const matchRuolo = ruoloCorrisponde(searchRuolo, g.ruolo, g.ruolo_mantra)
      
      const matchEta = searchEta === '' || (g.eta && g.eta <= parseInt(searchEta))

      return matchNome && matchSquadra && matchRuolo && matchEta
    })
  }, [giocatori, searchNome, searchSquadra, searchRuolo, searchEta])

  const giocatoriOrdinati = useMemo(() => {
    const segno = verso === 'asc' ? 1 : -1

    const chiave = (g: any): string | number | null => {
      if (colonna === 'nome') return g.nome ?? ''
      if (colonna === 'squadra') return g.squadra ?? ''
      if (colonna === 'ruolo') return PESO_RUOLO[g.ruolo] ?? 99
      if (colonna === 'eta') return g.eta ?? null
      return g.quotazione ?? null
    }

    return [...giocatoriFiltrati].sort((a, b) => {
      const ka = chiave(a)
      const kb = chiave(b)

      // I valori mancanti restano in fondo in entrambi i versi: un'età ignota
      // non è né la più bassa né la più alta, e in cima darebbe fastidio due
      // volte su tre.
      if (ka === null && kb === null) return a.nome.localeCompare(b.nome, 'it')
      if (ka === null) return 1
      if (kb === null) return -1

      const confronto = typeof ka === 'string'
        ? ka.localeCompare(kb as string, 'it')
        : (ka as number) - (kb as number)

      // A parità, il nome: senza, righe identiche si riordinano a ogni
      // ridisegno e l'elenco sembra instabile.
      return confronto === 0 ? a.nome.localeCompare(b.nome, 'it') : confronto * segno
    })
  }, [giocatoriFiltrati, colonna, verso])

  return (
    <div className="p-3 sm:p-4">
      {/* Filtri */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-md border border-line bg-panel-hi p-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <label htmlFor="f-nome" className="fm-label mb-1 block">Cerca per nome</label>
          <input
            id="f-nome"
            type="text"
            placeholder="Es. Barella…"
            className="fm-input"
            value={searchNome}
            onChange={(e) => setSearchNome(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-squadra" className="fm-label mb-1 block">Squadra</label>
          <select
            id="f-squadra"
            className="fm-select"
            value={searchSquadra}
            onChange={(e) => setSearchSquadra(e.target.value)}
          >
            <option value="">Tutte le squadre</option>
            {squadreUniche.map((sq: any) => (
              <option key={sq} value={sq}>{sq}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-ruolo" className="fm-label mb-1 block">Ruolo</label>
          <select
            id="f-ruolo"
            className="fm-select"
            value={searchRuolo}
            onChange={(e) => setSearchRuolo(e.target.value)}
          >
            <OpzioniRuolo presenti={ruoliMantra} />
          </select>
        </div>
        <div>
          <label htmlFor="f-eta" className="fm-label mb-1 block">Età (under max)</label>
          <input
            id="f-eta"
            type="number"
            placeholder="Es. 21"
            className="fm-input"
            value={searchEta}
            onChange={(e) => setSearchEta(e.target.value)}
          />
        </div>
        {/* Sotto md la tabella diventa una pila di schede e l'intestazione
            sparisce, quindi le colonne non sono più cliccabili: senza questa
            tendina l'ordinamento non esisterebbe proprio sul telefono, che è
            il dispositivo con cui la lista si consulta di più. */}
        <div className="md:hidden">
          <label htmlFor="f-ordine" className="fm-label mb-1 block">Ordina per</label>
          <select
            id="f-ordine"
            className="fm-select"
            value={`${colonna}:${verso}`}
            onChange={(e) => {
              const [c, v] = e.target.value.split(':')
              setColonna(c as Colonna)
              setVerso(v as Verso)
            }}
          >
            <option value="nome:asc">Nome A-Z</option>
            <option value="nome:desc">Nome Z-A</option>
            <option value="squadra:asc">Squadra A-Z</option>
            <option value="squadra:desc">Squadra Z-A</option>
            <option value="ruolo:asc">Reparto, dalla porta all&apos;attacco</option>
            <option value="eta:asc">Età, dal più giovane</option>
            <option value="eta:desc">Età, dal più vecchio</option>
            <option value="quotazione:desc">Quotazione decrescente</option>
            <option value="quotazione:asc">Quotazione crescente</option>
          </select>
        </div>
      </div>

      {/* Tabella Svincolati */}
      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards">
          <thead>
            <tr>
              {INTESTAZIONI.map(({ colonna: c, etichetta }) => (
                <th key={c} aria-sort={colonna === c ? (verso === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => ordinaPer(c)}
                    title={`Ordina per ${etichetta.toLowerCase()}`}
                    className="flex w-full items-center gap-1 uppercase tracking-[inherit] hover:text-ink"
                  >
                    {etichetta}
                    <span className={colonna === c ? 'text-neon' : 'text-ink-dim opacity-40'}>
                      {colonna === c ? (verso === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {giocatoriOrdinati.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-dim">
                  Nessun giocatore svincolato trovato con questi filtri.
                </td>
              </tr>
            ) : (
              giocatoriOrdinati.map((g) => (
                <tr key={g.id}>
                  <td data-label="Nome" className="fm-nome">{g.nome}</td>
                  <td data-label="Ruoli">
                    <span className="flex items-center justify-end gap-2 md:justify-start">
                      <span className="text-ink-mid">{g.ruolo}</span>
                      {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
                    </span>
                  </td>
                  <td data-label="Squadra" className="uppercase text-ink-mid">{g.squadra}</td>
                  <td data-label="Età" className="tabular-nums text-ink-mid">{g.eta ? String(g.eta) : '—'}</td>
                  <td data-label="Quotazione" className="tabular-nums">
                    <span className="fm-badge fm-badge-good">{g.quotazione}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-right">
        <span className="fm-label">
          Visualizzati {giocatoriOrdinati.length} su {giocatori.length}
        </span>
      </div>
    </div>
  )
}
