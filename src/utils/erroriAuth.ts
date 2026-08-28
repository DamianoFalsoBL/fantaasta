/**
 * Traduce in italiano gli errori di autenticazione di Supabase.
 *
 * I messaggi arrivano in inglese e sono scritti per chi sviluppa, non per chi
 * entra nel sito: davanti a «Invalid login credentials» un manager non sa se
 * ha sbagliato la password o il nome utente.
 *
 * **Non si inventa una distinzione che il server non fa.** Provato contro
 * Supabase: password sbagliata su un account esistente e utente del tutto
 * inesistente restituiscono lo stesso identico errore, `invalid_credentials`
 * con stato 400. È voluto — dire «questo utente non esiste» rivelerebbe quali
 * account ci sono — quindi la traduzione nomina tutte e due le cose.
 *
 * I codici vengono prima dei testi: `error.code` è stabile, `error.message`
 * cambia fra le versioni del server. Il confronto sul testo resta come rete di
 * sicurezza per le risposte che il codice non ce l'hanno.
 *
 * Quel che non è previsto **non viene inghiottito**: torna il messaggio
 * originale con il codice fra parentesi. Un messaggio generico che copre tutto
 * è comodo finché non serve capire cosa è andato storto davvero.
 */
export type ErroreAuth = { message: string; code?: string; status?: number } | null | undefined

export function messaggioErroreAuth(errore: ErroreAuth): string {
  if (!errore) return ''

  const codice = errore.code ?? ''
  const testo = errore.message ?? ''

  switch (codice) {
    case 'invalid_credentials':
    case 'user_not_found':
      return 'Utente o password non corretti.'
    case 'email_not_confirmed':
      return 'Account non ancora confermato: serve l’amministratore di lega.'
    case 'over_request_rate_limit':
      return 'Troppi tentativi ravvicinati. Aspetta un minuto e riprova.'
    case 'weak_password':
      return 'Password troppo debole per le regole del server: allungala.'
    case 'same_password':
      return 'La nuova password è uguale a quella attuale.'
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'La sessione è scaduta: esci e rientra.'
  }

  // Rete di sicurezza sul testo, per le risposte senza codice.
  if (/invalid login credentials/i.test(testo)) return 'Utente o password non corretti.'
  if (/email not confirmed/i.test(testo)) return 'Account non ancora confermato: serve l’amministratore di lega.'
  if (/rate limit/i.test(testo)) return 'Troppi tentativi ravvicinati. Aspetta un minuto e riprova.'

  // Il browser non ha raggiunto il server: non c'è codice perché non c'è
  // risposta. Va distinto, altrimenti sembra un problema di password.
  if (/failed to fetch|networkerror|network request failed/i.test(testo)) {
    return 'Server non raggiungibile: controlla la connessione e riprova.'
  }

  return codice ? `${testo} (codice: ${codice})` : testo
}
