import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Crea un client con diritti amministrativi (bypassa RLS)
// DA USARE SOLO IN SERVER ACTIONS O API ROUTES!
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
