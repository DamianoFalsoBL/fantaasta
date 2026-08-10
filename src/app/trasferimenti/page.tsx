import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUtente } from '@/utils/auth'
import { trasferimentiAttivi } from '@/utils/trasferimenti'
import TrasferimentiClient from './TrasferimentiClient'

export const dynamic = 'force-dynamic'

/**
 * Guardia lato server, non dentro il componente client.
 *
 * `src/app/admin/layout.tsx` porta scritto perché: con il controllo dentro il
 * client «la pagina veniva comunque servita e i dati venivano comunque
 * richiesti». Un `router.replace()` qui ripeterebbe un errore già corretto una
 * volta — e a funzione spenta il browser scaricherebbe lo stesso l'elenco di
 * tutti i tesserati della lega prima di rimandare altrove.
 */
export default async function TrasferimentiPage() {
  await requireUtente()
  const supabase = await createClient()

  if (!(await trasferimentiAttivi(supabase))) redirect('/asta')

  return <TrasferimentiClient />
}
