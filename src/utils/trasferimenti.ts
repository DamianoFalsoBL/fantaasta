// Vocabolario condiviso del mercato trasferimenti.
//
// Gli stati di un'offerta sono sette e cinque di essi sono modi diversi di
// dire "non se n'è fatto niente": senza etichette distinte il manager non
// capirebbe da chi è dipeso. Stanno qui, e non in ogni pagina, perché la
// stessa offerta compare nella lista del proponente, in quella del ricevente
// e nella coda di ratifica dell'admin.

export type StatoOfferta =
  | 'ATTESA'
  | 'ACCETTATA'
  | 'RIFIUTATA'
  | 'RITIRATA'
  | 'RESPINTA'
  | 'DECADUTA'
  | 'ESEGUITA'

export const ETICHETTA_STATO: Record<StatoOfferta, { testo: string; chip: string }> = {
  ATTESA:    { testo: '⏳ In attesa di risposta', chip: 'fm-chip-ambra' },
  ACCETTATA: { testo: '👍 Accettata · attende l’admin', chip: 'fm-chip-attivo' },
  RIFIUTATA: { testo: '✕ Rifiutata', chip: 'fm-chip-rosso' },
  RITIRATA:  { testo: '↩ Ritirata', chip: '' },
  RESPINTA:  { testo: '⚖️ Non ratificata dall’admin', chip: 'fm-chip-rosso' },
  DECADUTA:  { testo: '💤 Decaduta', chip: '' },
  ESEGUITA:  { testo: '✅ Conclusa', chip: 'fm-chip-neon' },
}

export type GiocatoreMercato = {
  id: number
  nome: string
  ruolo: 'P' | 'D' | 'C' | 'A'
  squadra: string | null
  quotazione: number
  eta: number | null
  ruolo_mantra: string[] | null
}

/**
 * Il valore di una contropartita: crediti più la somma delle quotazioni dei
 * calciatori ceduti. È la regola che decide quanto risulterà costato il
 * giocatore ricevuto, e va mostrata al manager mentre costruisce l'offerta,
 * non scoperta dopo.
 */
export function valoreContropartita(crediti: number, ceduti: GiocatoreMercato[]): number {
  return crediti + ceduti.reduce((somma, g) => somma + g.quotazione, 0)
}

/** Classe del badge di ruolo, allineata a quella usata nelle rose. */
export function badgeRuolo(ruolo: string): string {
  if (ruolo === 'P') return 'fm-badge-mid'
  if (ruolo === 'D') return 'fm-badge-top'
  if (ruolo === 'C') return 'fm-badge-good'
  return 'fm-badge-bad'
}

export const ORDINE_RUOLI: Record<string, number> = { P: 1, D: 2, C: 3, A: 4 }
