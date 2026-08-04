/**
 * Predicati sui ruoli, senza dipendenze server.
 *
 * Stanno in un file separato da `auth.ts` perché quest'ultimo importa il client
 * SSR (che usa `next/headers`) e non può quindi essere importato da un
 * componente client.
 */

export type Ruolo = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER'

/**
 * Un SUPER_ADMIN è sempre anche un ADMIN.
 *
 * Prima questo confronto era sparso nel codice con esiti incoerenti:
 * `rose/page.tsx` e `asta/page.tsx` consideravano admin solo 'ADMIN',
 * escludendo il SUPER_ADMIN, mentre `NavBar.tsx` accettava entrambi.
 */
export function isAdminRole(ruolo: Ruolo | null | undefined): boolean {
  return ruolo === 'ADMIN' || ruolo === 'SUPER_ADMIN'
}

export function isSuperAdminRole(ruolo: Ruolo | null | undefined): boolean {
  return ruolo === 'SUPER_ADMIN'
}
