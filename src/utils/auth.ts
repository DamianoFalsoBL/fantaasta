// Solo server: importa il client SSR, che usa `next/headers`.
// I predicati puri sui ruoli stanno in `auth-shared.ts`, importabile dai client.
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { isAdminRole, isSuperAdminRole, type Ruolo } from '@/utils/auth-shared'

export { isAdminRole, isSuperAdminRole }
export type { Ruolo }

export type Profilo = {
  id: string
  ruolo: Ruolo
  squadra_id: string | null
}

/**
 * Profilo dell'utente autenticato, o `null` se non autenticato.
 *
 * Usa `getUser()` e non `getSession()`: lato server `@supabase/ssr` avverte
 * che la sessione letta dai cookie non è verificata, mentre `getUser()`
 * valida il token contro Supabase Auth.
 */
export async function getProfiloCorrente(): Promise<Profilo | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profili')
    .select('id, ruolo, squadra_id')
    .eq('id', user.id)
    .single()

  return (data as Profilo) ?? null
}

/** Richiede un utente autenticato; altrimenti rimanda alla home. */
export async function requireUtente(): Promise<Profilo> {
  const profilo = await getProfiloCorrente()
  if (!profilo) redirect('/')
  return profilo
}

/** Richiede ADMIN o SUPER_ADMIN. */
export async function requireAdmin(): Promise<Profilo> {
  const profilo = await requireUtente()
  if (!isAdminRole(profilo.ruolo)) redirect('/asta')
  return profilo
}

/** Richiede SUPER_ADMIN. */
export async function requireSuperAdmin(): Promise<Profilo> {
  const profilo = await requireUtente()
  if (!isSuperAdminRole(profilo.ruolo)) redirect('/asta')
  return profilo
}
