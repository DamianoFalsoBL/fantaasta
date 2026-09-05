/**
 * Chi deve ancora chiamare, e quanto manca al proprio turno.
 *
 * Funzione pura e fuori dal componente per la stessa ragione di
 * `statoLega.ts`: qui dentro non c'e' niente di visibile che segnali un
 * errore. Un «mancano 3 turni» sbagliato resta una frase sensata, e la si
 * scopre solo quando qualcuno si perde il proprio turno — cioe' durante
 * l'asta, quando non si puo' piu' rimediare. Con la logica separata si puo'
 * far girare sui casi limite senza aprire il browser.
 */

export type StatoTurno = {
  /** Le squadre che devono ancora chiamare, nell'ordine sorteggiato. */
  daChiamare: string[]
  /** Quante hanno finito: rosa piena o niente piu' giocatori in lista. */
  concluse: number
  /** Chi e' di turno adesso. */
  turno: string | undefined
  /** Chi chiama subito dopo, `undefined` se non c'e' nessun altro. */
  dopo: string | undefined
  /**
   * Quanti turni mancano al proprio. Negativo se il proprio posto viene prima
   * di quello di turno, cioe' se si e' gia' chiamato in questo giro; `null` se
   * non si e' nella fila (rosa piena, oppure si sta guardando da admin).
   */
  turniMancanti: number | null
}

export function descriviTurno(
  ordine: string[],
  /** Posizione di turno, contata da 1 come `regole_lega.indice_chiamata`. */
  indice: number,
  /** Chi ha ancora qualcuno da chiamare. */
  attive: Set<string>,
  squadraId: string | null,
): StatoTurno {
  if (ordine.length === 0) {
    return { daChiamare: [], concluse: 0, turno: undefined, dopo: undefined, turniMancanti: null }
  }

  // Si mostrano solo le squadre che devono ancora chiamare. Quella di turno
  // resta sempre nella fila anche se ha finito, per non lasciare la barra
  // senza riferimento durante l'attimo in cui il turno sta avanzando.
  const daChiamare = ordine.filter(
    (sqId, idx) => attive.has(sqId) || (idx + 1) === indice,
  )

  const turno = ordine[indice - 1]
  const turnoCorrente = daChiamare.indexOf(turno)
  const mioPosto = daChiamare.indexOf(squadraId ?? '')

  // Il modulo serve per l'ultimo della fila: senza, il «poi tocca a…»
  // sparirebbe proprio all'ultimo turno del giro, che e' quando serve di piu'.
  const dopo = daChiamare.length > 1 && turnoCorrente >= 0
    ? daChiamare[(turnoCorrente + 1) % daChiamare.length]
    : undefined

  return {
    daChiamare,
    concluse: ordine.length - daChiamare.length,
    turno,
    dopo,
    turniMancanti: mioPosto >= 0 && turnoCorrente >= 0 ? mioPosto - turnoCorrente : null,
  }
}

/**
 * La frase su di se': «sei il prossimo», «mancano 3 turni»…
 *
 * `turniMancanti` negativo non e' un errore da nascondere: vuol dire che si e'
 * gia' chiamato in questo giro. Prima quel caso non produceva nessuna scritta,
 * e chi aveva gia' chiamato restava senza risposta — cioe' la maggior parte
 * dei presenti mentre un'asta e' viva.
 */
export function avvisoTurno(turniMancanti: number | null, isMioTurno: boolean): string | null {
  if (isMioTurno) return 'tocca a te'
  if (turniMancanti === null) return null
  if (turniMancanti === 1) return 'sei il prossimo'
  if (turniMancanti > 1) return `mancano ${turniMancanti} turni`
  if (turniMancanti < 0) return 'hai già chiamato in questo giro'
  // Zero senza essere di turno: succede all'admin che guarda la barra di una
  // squadra non sua. Meglio niente che una frase che non lo riguarda.
  return null
}
