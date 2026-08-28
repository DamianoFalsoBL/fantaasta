import { redirect } from 'next/navigation'

/**
 * `/login` non è più una pagina: rimanda alla home, che è l'unico accesso.
 *
 * Ce n'erano due, e la seconda era rotta per come si accede davvero qui. Il
 * campo era `type="email"`, quindi il browser rifiutava «Gianni» chiedendo una
 * chiocciola; e anche superandolo, la server action passava il valore
 * direttamente a `signInWithPassword` senza la conversione in
 * `gianni@fantacalcio.local` che fa `LoginForm`. Il segnaposto suggeriva
 * perfino `@fantacalcio.it`, un dominio che qui non esiste: chi lo avesse
 * seguito alla lettera avrebbe sbagliato lo stesso.
 *
 * Non si è corretta la seconda pagina ma tolta: due moduli di accesso da
 * tenere allineati sono lo stesso schema che in questo progetto ha già
 * prodotto filtri e ordinamenti divergenti fra pagine.
 *
 * La rotta resta, come rimando, perché era raggiungibile: dai segnalibri di
 * chi c'è già finito, e da `/buste` quando la sessione scadeva.
 */
export default function LoginPage() {
  redirect('/')
}
