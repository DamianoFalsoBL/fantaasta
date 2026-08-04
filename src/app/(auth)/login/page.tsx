import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/* Le varianti `dark:` che c'erano qui sono state rimosse: il tema è
          unico e scuro, e con `dark:` legato a prefers-color-scheme un utente
          con sistema chiaro avrebbe visto metà pagina in tema chiaro. */}
      <div className="fm-panel w-full max-w-md space-y-8 p-8 shadow-xl">

        <div className="text-center">
          <h2 className="fm-title text-3xl">
            Asta <span className="text-neon">Live</span>
          </h2>
          <p className="mt-2 text-sm text-ink-mid">
            Accedi per gestire la tua rosa o avviare l&apos;asta
          </p>
        </div>

        <form className="mt-8 space-y-6" action={login}>
          <div className="space-y-4">
            <div>
              <label className="fm-label mb-1.5 block" htmlFor="email">
                Indirizzo Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="fm-input"
                placeholder="manager@fantacalcio.it"
              />
            </div>
            <div>
              <label className="fm-label mb-1.5 block" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="fm-input"
                placeholder="••••••••"
              />
            </div>
          </div>

          {message && <div className="fm-alert fm-alert-danger">{message}</div>}

          <button type="submit" className="fm-btn fm-btn-primary w-full">
            Accedi
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-dim">
          I nuovi account possono essere creati solo dall&apos;amministratore di lega.
        </p>

      </div>
    </div>
  )
}
