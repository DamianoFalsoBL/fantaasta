'use client'

interface MantraBadgeProps {
  ruoli: string[]
}

export default function MantraBadge({ ruoli }: MantraBadgeProps) {
  if (!ruoli || ruoli.length === 0) return null

  // La mappatura ruolo -> colore è una convenzione di dominio e resta quella:
  //   ambra  P
  //   verde  DS, DC, DD, B
  //   ciano  E, M, C
  //   viola  W, T
  //   rosso  A, PC
  // Cambia solo la resa: non più fondi pieni saturi, ma fondi scuri tinti con
  // testo colorato, coerenti con gli altri badge della dashboard.
  const classeColore = (r: string) => {
    const ruolo = r.toUpperCase()
    if (ruolo === 'P') return 'fm-badge-mid'
    if (['DS', 'DC', 'DD', 'B'].includes(ruolo)) return 'fm-badge-top'
    if (['E', 'M', 'C'].includes(ruolo)) return 'fm-badge-good'
    if (['W', 'T'].includes(ruolo)) return 'fm-badge-viola'
    if (['A', 'PC'].includes(ruolo)) return 'fm-badge-bad'
    return 'fm-badge-low' // Default per sicurezza
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {ruoli.map((r, i) => (
        <span
          key={i}
          className={`fm-badge uppercase ${classeColore(r)}`}
          title={`Ruolo Mantra: ${r.toUpperCase()}`}
        >
          {r}
        </span>
      ))}
    </div>
  )
}
