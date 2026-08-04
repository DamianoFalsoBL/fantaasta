import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getProfiloCorrente, isAdminRole } from '@/utils/auth'

/**
 * Export finale delle rose, da ricaricare sulla piattaforma di gioco.
 *
 * Serve un file di testo, non un foglio di calcolo: tre colonne soltanto,
 * `id calciatore, nome fantasquadra, costo`. L'id è quello del listone
 * (colonna `#`), cioè la stessa chiave usata in fase di import: chi rilegge
 * il file ritrova gli stessi giocatori senza dover riconciliare i nomi.
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

export async function GET(request: Request) {
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

  // Ordinamento per squadra e poi per id: il file resta leggibile a occhio,
  // con le rose una sotto l'altra.
  righe.sort((a, b) => {
    const perSquadra = (a.squadre?.nome ?? '').localeCompare(b.squadre?.nome ?? '', 'it')
    return perSquadra !== 0 ? perSquadra : a.giocatore_id - b.giocatore_id
  })

  const senzaIntestazione = new URL(request.url).searchParams.get('intestazione') === 'no'

  const linee = righe.map((r) =>
    [
      String(r.giocatore_id),
      campoCsv(r.squadre?.nome ?? ''),
      String(r.prezzo_pagato),
    ].join(',')
  )

  if (!senzaIntestazione) {
    linee.unshift('id,fantasquadra,costo')
  }

  // CRLF e BOM: senza BOM Excel apre il file in ANSI e storpia gli accenti
  // nei nomi delle fantasquadre.
  const csv = '﻿' + linee.join('\r\n') + '\r\n'

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rose-${istante()}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
