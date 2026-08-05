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

export default function AsteClient({ righe }: { righe: RigaAsta[] }) {
  const [nome, setNome] = useState('')
  const [ruolo, setRuolo] = useState('')
  const [squadraFanta, setSquadraFanta] = useState('')
  const [soloContesi, setSoloContesi] = useState(false)
  const [soloMie, setSoloMie] = useState(false)

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

  return (
    <div className="p-3 sm:p-4">
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metrica etichetta="Giocatori in lista" valore={righe.length} />
        <Metrica etichetta="Contesi" valore={contesi} accento />
        <Metrica etichetta="Senza contendenti" valore={righe.length - contesi} />
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
              <th className="fm-num">Età</th>
              <th>Squadra</th>
              <th className="fm-num">Prezzo</th>
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
                  <td data-label="Età" className="fm-num text-ink-mid">{r.eta ? String(r.eta) : '—'}</td>
                  <td data-label="Squadra" className="text-ink-mid">{r.squadra ?? '—'}</td>
                  <td data-label="Prezzo" className="fm-num">
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
