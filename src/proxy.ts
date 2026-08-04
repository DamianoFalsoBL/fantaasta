import type { NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

/**
 * In Next.js 16 il middleware si chiama `proxy.ts`.
 *
 * Questo file mancava del tutto: `updateSession` esisteva già in
 * `src/utils/supabase/middleware.ts` ma non era importata da nessuna parte,
 * quindi il token di sessione non veniva mai rinnovato lato server. I Server
 * Component vedevano sessioni scadute e l'utente sembrava perdere i privilegi
 * di admin dopo un po' di inattività.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Tutte le richieste tranne file statici e immagini, che non hanno
     * bisogno del refresh della sessione.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
