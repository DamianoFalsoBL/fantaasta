import MantraBadge from '@/components/MantraBadge'

/**
 * I ruoli di un giocatore in una riga di elenco.
 *
 * Mostra le pastiglie Mantra e **non** la lettera del reparto classico: è la
 * stessa informazione detta due volte, visto che Pc implica A e Dc implica D,
 * e in una riga stretta ruba spazio a quello che distingue davvero un
 * giocatore dall'altro.
 *
 * La lettera resta come ripiego quando i ruoli Mantra mancano. Oggi non
 * capita — letto il database: 0 giocatori su 549 — ma capiterebbe con un
 * listone in formato classico, e senza il ripiego la colonna resterebbe vuota
 * per tutti invece che per nessuno.
 *
 * Esiste come componente perché la stessa coppia compariva in otto punti con
 * otto condizioni scritte a mano: bastava dimenticarne una perché una pagina
 * continuasse a mostrare la lettera.
 *
 * **Non lo usano gli elenchi di rosa** (`/rose`, `/mia-rosa`,
 * `/trasferimenti`): lì la lettera è una pastiglia colorata in testa alla
 * riga, e quella colonna di colori è come si conta a colpo d'occhio quanti
 * portieri e quanti difensori si hanno. Non è ripetizione, è il modo in cui si
 * legge una rosa.
 */
export default function RuoliGiocatore({
  ruolo,
  ruoloMantra,
}: {
  ruolo: string | null | undefined
  ruoloMantra: string[] | null | undefined
}) {
  if (ruoloMantra && ruoloMantra.length > 0) return <MantraBadge ruoli={ruoloMantra} />
  return <span className="text-ink-mid">{ruolo}</span>
}
