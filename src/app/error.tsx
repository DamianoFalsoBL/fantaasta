'use client'

import { useEffect } from 'react'

/**
 * Error boundary globale.
 *
 * Non esisteva alcun error.tsx: qualunque eccezione durante il rendering
 * (tipicamente un accesso a `t.giocatori.nome` su una riga orfana) mostrava
 * la schermata di errore grezza di Next.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center">
      <h1 className="fm-title mb-3 text-3xl text-rosso">Qualcosa è andato storto</h1>
      <p className="mb-3 text-ink-mid">
        Si è verificato un errore durante il caricamento della pagina.
      </p>
      {error.message && (
        <p className="mb-6 break-words rounded-md border border-line bg-void p-3 font-mono text-sm text-ink-mid">
          {error.message}
        </p>
      )}
      <div className="flex justify-center gap-3">
        <button onClick={reset} className="fm-btn fm-btn-primary">
          Riprova
        </button>
        <a href="/asta" className="fm-btn fm-btn-ghost">
          Torna al tabellone
        </a>
      </div>
    </div>
  )
}
