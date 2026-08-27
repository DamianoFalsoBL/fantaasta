import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getProfiloCorrente, isAdminRole } from '@/utils/auth'

/**
 * Export finale delle rose, nel formato che fantacalcio.it accetta in import.
 *
 * Il formato NON è una scelta nostra: è stato ricavato confrontando un export
 * vero della loro piattaforma (`la-lega-dei-furbi_rosters_*.csv`) con quello
 * che generavamo prima, che loro rifiutavano. Tre differenze strutturali:
 *
 *   1. le colonne sono `fantasquadra, id, costo` — noi mettevamo l'id per
 *      primo, quindi il loro lettore trovava un numero dove aspetta un nome;
 *   2. non c'è riga di intestazione: al suo posto una riga `$,$,$` **prima di
 *      ogni** squadra, che è come segnano l'inizio di una rosa;
 *   3. niente BOM e fine riga LF, mentre noi scrivevamo BOM + CRLF.
 *
 * Il BOM serviva a far aprire il file a Excel senza storpiare gli accenti dei
 * nomi delle fantasquadre. Toglierlo è un compromesso accettato: questo file
 * ha un solo scopo, essere ricaricato da loro, e un BOM davanti alla prima
 * riga `$,$,$` è esattamente il tipo di byte invisibile che fa fallire un
 * lettore senza dire perché.
 *
 * L'id è quello del listone (colonna `#`), la stessa chiave usata in import.
 *
 * Non si usa `requireAdmin()` perché quell'helper fa `redirect()`, pensato per
 * le pagine: in un route handler produrrebbe un 307 verso una pagina HTML
 * invece di una risposta comprensibile a chi sta scaricando un file.
 */
export const dynamic = 'force-dynamic'

/**
 * Marca temporale per il nome del file: `2026-08-04_18-42-07`.
 *
 * Con la sola data due export dello stesso giorno finivano nello stesso nome e
 * il browser li rinominava in `rose-2026-08-04 (1).csv`, perdendo l'ordine.
 *
 * L'ora è quella italiana, non quella del server: su Vercel il runtime gira in
 * UTC, quindi d'estate un export delle 21:30 si sarebbe chiamato `19-30`.
 * I due punti non si usano: su Windows non sono ammessi nei nomi dei file.
 */
function istante(): string {
  const parti = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date())

  // `sv-SE` produce già `2026-08-04 18:42:07`, formato ISO senza sorprese.
  return parti.replace(' ', '_').replace(/:/g, '-')
}

/** Virgolette secondo RFC 4180: servono se il campo contiene `,`, `"` o a capo. */
function campoCsv(valore: string): string {
  return /[",\r\n]/.test(valore) ? `"${valore.replace(/"/g, '""')}"` : valore
}

export async function GET() {
  const profilo = await getProfiloCorrente()
  if (!profilo) {
    return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 })
  }
  if (!isAdminRole(profilo.ruolo)) {
    return NextResponse.json({ error: 'Riservato agli amministratori.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tesseramenti')
    .select('giocatore_id, prezzo_pagato, squadre(nome)')
    .order('giocatore_id')
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Riga = { giocatore_id: number; prezzo_pagato: number; squadre: { nome: string } | null }
  const righe = (data ?? []) as unknown as Riga[]

  // Le rose una sotto l'altra, squadre in ordine alfabetico. Dentro ogni rosa
  // l'id scende: è l'ordine del loro file, e allinearsi costa zero. Non credo
  // che il loro lettore ci guardi, ma è una differenza in meno da sospettare
  // se un giorno l'import tornasse a fallire.
  const perSquadra = new Map<string, Riga[]>()
  for (const r of righe) {
    const nome = r.squadre?.nome ?? ''
    if (!perSquadra.has(nome)) perSquadra.set(nome, [])
    perSquadra.get(nome)!.push(r)
  }

  const linee: string[] = []
  for (const nome of [...perSquadra.keys()].sort((a, b) => a.localeCompare(b, 'it'))) {
    // Il separatore va PRIMA di ogni blocco, compreso il primo: nel loro file
    // ci sono dieci `$,$,$` per dieci squadre, non nove.
    linee.push('$,$,$')
    const rose = perSquadra.get(nome)!.sort((a, b) => b.giocatore_id - a.giocatore_id)
    for (const r of rose) {
      // Il nome squadra è l'unico campo che potrebbe contenere una virgola.
      // Le virgolette RFC 4180 sono la cosa corretta da scrivere, ma se un
      // giorno una squadra si chiamasse "Rossi, Bianchi e Verdi" varrebbe la
      // pena controllare che il loro lettore le interpreti invece di spezzare
      // la riga in quattro campi.
      linee.push([campoCsv(nome), String(r.giocatore_id), String(r.prezzo_pagato)].join(','))
    }
  }

  const csv = linee.join('\n') + '\n'

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rose-${istante()}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
