'use client'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Formatta l'username nell'email fittizia usata in fase di importazione se non c'è la @
    const formattedEmail = usernameOrEmail.includes('@') 
      ? usernameOrEmail 
      : `${usernameOrEmail.replace(/\s+/g, '').toLowerCase()}@fantacalcio.local`

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const { data: profilo } = await supabase.from('profili').select('ruolo').eq('id', authData.user.id).single()
      
      if (profilo?.ruolo === 'SUPER_ADMIN') {
        router.push('/admin/setup')
      } else {
        router.push('/asta')
      }
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleLogin} className="fm-panel mt-8 flex w-full max-w-sm flex-col gap-4 p-6 text-left shadow-xl">
      <h2 className="fm-title text-xl">Accedi</h2>

      {error && <div className="fm-alert fm-alert-danger font-semibold">{error}</div>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-utente" className="fm-label">Username o Email</label>
        <input
          id="login-utente"
          type="text"
          value={usernameOrEmail}
          onChange={(e) => setUsernameOrEmail(e.target.value)}
          className="fm-input"
          required
          placeholder="es. Mario Rossi"
        />
      </div>

      <div className="mb-2 flex flex-col gap-1.5">
        <label htmlFor="login-password" className="fm-label">Password</label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="fm-input pr-10"
            required
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-dim transition hover:text-ink"
            tabIndex={-1}
            aria-label={showPassword ? 'Nascondi la password' : 'Mostra la password'}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="fm-btn fm-btn-primary w-full"
      >
        {loading ? 'Accesso…' : 'Entra nell\'Asta'}
      </button>
    </form>
  )
}
