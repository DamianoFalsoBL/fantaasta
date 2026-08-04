import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { getProfiloCorrente } from '@/utils/auth'

export default async function Home() {
  // Chi è già autenticato non deve vedere il form di accesso: prima la home lo
  // mostrava sempre, e insieme alla navbar produceva una schermata
  // contraddittoria (menu utente in alto e login al centro).
  const profilo = await getProfiloCorrente()
  if (profilo) {
    redirect(profilo.ruolo === 'SUPER_ADMIN' ? '/admin/setup' : '/asta')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <main className="flex flex-col items-center gap-4 p-4 text-center sm:p-8">
        <span className="fm-chip fm-chip-neon">Dolomiti Fanta League</span>

        <h1 className="fm-title text-4xl sm:text-6xl">
          Fantacalcio <span className="text-neon">Asta Live</span>
        </h1>

        <p className="max-w-xl text-ink-mid">
          Gestione dell&apos;asta, del mercato di riparazione e delle rose.
        </p>

        <LoginForm />
      </main>
    </div>
  );
}
