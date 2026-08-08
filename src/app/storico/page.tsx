import { redirect } from 'next/navigation'

/**
 * Lo storico e' diventato una scheda dentro /aste: erano le due meta' della
 * stessa domanda — cosa resta da assegnare e cosa e' gia' andato — e per
 * confrontarle bisognava cambiare pagina.
 *
 * L'indirizzo resta vivo invece di sparire: qualcuno potrebbe averlo nei
 * preferiti o averlo incollato in chat, e un 404 non spiegherebbe dove e'
 * finito. Stesso motivo per cui /admin rimanda a /admin/setup.
 */
export default function StoricoPage() {
  redirect('/aste')
}
