import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { trasferimentiAttivi } from '@/utils/trasferimenti'
import RatificaClient from './RatificaClient'

export const dynamic = 'force-dynamic'

/**
 * Il ruolo lo controlla già `src/app/admin/layout.tsx`: qui resta da verificare
 * solo che la funzione sia accesa.
 *
 * A funzione spenta si rimanda al riepilogo e non alla home, perché chi arriva
 * qui è un admin: ha senso lasciarlo dove lavora di solito.
 */
export default async function AdminTrasferimentiPage() {
  const supabase = await createClient()

  if (!(await trasferimentiAttivi(supabase))) redirect('/admin/riepilogo')

  return <RatificaClient />
}
