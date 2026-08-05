'use client'
import { useState, useMemo } from 'react'
import MantraBadge from '@/components/MantraBadge'

export default function SvincolatiClient({ giocatori }: { giocatori: any[] }) {
  const [searchNome, setSearchNome] = useState('')
  const [searchSquadra, setSearchSquadra] = useState('')
  const [searchRuolo, setSearchRuolo] = useState('')
  const [searchEta, setSearchEta] = useState('')

  // Estrai tutte le squadre uniche per il filtro
  const squadreUniche = useMemo(() => {
    const sq = new Set(giocatori.map(g => g.squadra).filter(Boolean))
    return Array.from(sq).sort()
  }, [giocatori])

  // Estrai tutti i ruoli mantra (e classici) unici per il filtro
  const ruoliUnici = useMemo(() => {
    const ruoli = new Set<string>()
    giocatori.forEach(g => {
      if (g.ruolo) ruoli.add(g.ruolo)
      if (g.ruolo_mantra) {
        g.ruolo_mantra.forEach((r: string) => ruoli.add(r.toUpperCase()))
      }
    })
    return Array.from(ruoli).sort()
  }, [giocatori])

  // Filtra i giocatori
  const giocatoriFiltrati = useMemo(() => {
    return giocatori.filter(g => {
      const matchNome = g.nome.toLowerCase().includes(searchNome.toLowerCase())
      const matchSquadra = searchSquadra === '' || g.squadra === searchSquadra
      
      const matchRuolo = searchRuolo === '' || 
        g.ruolo === searchRuolo || 
        (g.ruolo_mantra && g.ruolo_mantra.map((r:string) => r.toUpperCase()).includes(searchRuolo.toUpperCase()))
      
      const matchEta = searchEta === '' || (g.eta && g.eta <= parseInt(searchEta))

      return matchNome && matchSquadra && matchRuolo && matchEta
    })
  }, [giocatori, searchNome, searchSquadra, searchRuolo, searchEta])

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
            <option value="">Tutti i ruoli</option>
            {ruoliUnici.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
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
      </div>

      {/* Tabella Svincolati */}
      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruoli</th>
              <th>Squadra</th>
              <th className="fm-num">Età</th>
              <th className="fm-num">Quotazione</th>
            </tr>
          </thead>
          <tbody>
            {giocatoriFiltrati.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-dim">
                  Nessun giocatore svincolato trovato con questi filtri.
                </td>
              </tr>
            ) : (
              giocatoriFiltrati.map((g) => (
                <tr key={g.id}>
                  <td data-label="Nome" className="fm-nome">{g.nome}</td>
                  <td data-label="Ruoli">
                    <span className="flex items-center justify-end gap-2 md:justify-start">
                      <span className="text-ink-mid">{g.ruolo}</span>
                      {g.ruolo_mantra && g.ruolo_mantra.length > 0 && <MantraBadge ruoli={g.ruolo_mantra} />}
                    </span>
                  </td>
                  <td data-label="Squadra" className="uppercase text-ink-mid">{g.squadra}</td>
                  <td data-label="Età" className="fm-num text-ink-mid">{g.eta ? String(g.eta) : '—'}</td>
                  <td data-label="Quotazione" className="fm-num">
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
          Visualizzati {giocatoriFiltrati.length} su {giocatori.length}
        </span>
      </div>
    </div>
  )
}
