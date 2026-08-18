'use server'

import * as xlsx from 'xlsx'
import { createAdminClient } from '@/utils/supabase/admin'
import { getProfiloCorrente, isAdminRole, isSuperAdminRole } from '@/utils/auth'
import type { Json } from '@/utils/supabase/database.types'

export type RisultatoImport = { success?: string; error?: string; dettagli?: string[] }

/**
 * Le Server Action sono endpoint POST raggiungibili da chiunque conosca l'ID
 * dell'action: il controllo di ruolo lato client in `/admin/setup` non le
 * proteggeva in alcun modo. Queste funzioni girano con la service role e
 * bypassano le RLS, quindi il gate deve stare qui.
 */
async function assertSuperAdmin(): Promise<string | null> {
  const profilo = await getProfiloCorrente()
  if (!profilo) return 'Non sei autenticato.'
  if (!isSuperAdminRole(profilo.ruolo)) return 'Accesso negato: azione riservata al Super Admin.'
  return null
}

async function assertAdmin(): Promise<string | null> {
  const profilo = await getProfiloCorrente()
  if (!profilo) return 'Non sei autenticato.'
  if (!isAdminRole(profilo.ruolo)) return 'Accesso negato: azione riservata agli amministratori.'
  return null
}

/** Legge il primo foglio del file caricato come array di oggetti. */
/**
 * Legge il foglio di un file Excel.
 *
 * Prendere sempre il primo foglio funziona con gli export del listone, che ne
 * hanno uno solo, ma non con il gestionale della lega: 36 fogli, e il primo è
 * la tabella squadra→proprietario. L'import scartava tutte le righe con
 * "manca # o Nome", indicando la cosa sbagliata.
 *
 * Con `riconosci` si cerca il primo foglio le cui intestazioni superano il
 * controllo; senza, resta il comportamento di prima.
 */
async function leggiFoglio(
  formData: FormData,
  riconosci?: (colonne: string[]) => boolean
): Promise<Record<string, unknown>[]> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Nessun file selezionato.')
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = xlsx.read(buffer)

  if (wb.SheetNames.length === 0) throw new Error('Il file non contiene alcun foglio.')

  if (!riconosci) {
    return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[]
  }

  for (const nome of wb.SheetNames) {
    const righe = xlsx.utils.sheet_to_json(wb.Sheets[nome]) as Record<string, unknown>[]
    if (righe.length === 0) continue
    // Anche qui l'unione di tutte le righe e non solo la prima: se nel foglio
    // giusto il primo calciatore avesse una cella vuota fra quelle cercate, il
    // foglio non verrebbe riconosciuto e l'errore indicherebbe la cosa
    // sbagliata. E' lo stesso difetto corretto in importAste.
    const colonne = [...new Set(righe.flatMap((r) => Object.keys(r)))].map((c) => c.toLowerCase().trim())
    if (riconosci(colonne)) return righe
  }

  // Elencare i fogli trovati evita di dover indovinare quale sia quello giusto.
  throw new Error(
    `Nessun foglio contiene le colonne attese. Fogli nel file: ${wb.SheetNames.join(', ')}.`
  )
}

/** Chiavi in minuscolo e senza spazi ai bordi, per tollerare intestazioni diverse. */
function normalizzaChiavi(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    out[key.toLowerCase().trim()] = row[key]
  }
  return out
}

function testo(valore: unknown): string {
  return valore === null || valore === undefined ? '' : String(valore).trim()
}

function numero(valore: unknown): number | null {
  const n = Number(testo(valore).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i segni diacritici
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'squadra'
}

// -----------------------------------------------------------------------------
// Utenti, squadre e budget
// -----------------------------------------------------------------------------

/**
 * Colonne attese: nome utente | password | nome squadra | budget
 *
 * La versione precedente scriveva `crediti_iniziali` (la colonna è
 * `budget_iniziale`) e ometteva `slug`, che è NOT NULL UNIQUE: l'upsert
 * falliva su ogni riga, ma `successCount` restava 0 e l'action riportava
 * comunque "0 utenti e squadre importati!" come successo.
 */
export async function importBudget(formData: FormData): Promise<RisultatoImport> {
  const negato = await assertSuperAdmin()
  if (negato) return { error: negato }

  let righe: Record<string, unknown>[]
  try {
    righe = await leggiFoglio(formData)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()
  const dettagli: string[] = []
  const slugUsati = new Set<string>()
  let importate = 0

  for (const [indice, rawRow] of righe.entries()) {
    const riga = normalizzaChiavi(rawRow)
    const numeroRiga = indice + 2 // +1 per l'intestazione, +1 per partire da 1

    const username = testo(riga['nome utente'] ?? riga['username'] ?? riga['utente'])
    const nomeSquadra = testo(riga['nome squadra'] ?? riga['squadra'] ?? riga['fantasquadra'])
    const password = testo(riga['password'])
    const budget = numero(riga['budget']) ?? 500

    if (!username || !nomeSquadra) {
      dettagli.push(`Riga ${numeroRiga}: manca "nome utente" o "nome squadra".`)
      continue
    }
    if (!password) {
      // Nessuna password di ripiego: prima c'era 'password123' hardcoded,
      // identica per tutti gli account creati.
      dettagli.push(`Riga ${numeroRiga} (${nomeSquadra}): password mancante.`)
      continue
    }

    const email = username.includes('@')
      ? username.toLowerCase()
      : `${username.replace(/\s+/g, '').toLowerCase()}@fantacalcio.local`

    // Slug univoco anche con nomi squadra simili.
    let slug = slugify(nomeSquadra)
    let suffisso = 2
    while (slugUsati.has(slug)) {
      slug = `${slugify(nomeSquadra)}-${suffisso++}`
    }
    slugUsati.add(slug)

    // 1. Account di autenticazione (o recupero di quello esistente).
    let userId: string | null = null
    const { data: creato, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (creato?.user) {
      userId = creato.user.id
    } else {
      const { data: esistenti } = await admin.auth.admin.listUsers()
      const esistente = esistenti?.users.find((u) => u.email?.toLowerCase() === email)
      if (esistente) {
        userId = esistente.id
        await admin.auth.admin.updateUserById(esistente.id, { password })
      } else {
        dettagli.push(`Riga ${numeroRiga} (${nomeSquadra}): ${authError?.message ?? 'utente non creato'}.`)
        continue
      }
    }

    // 2. Squadra. L'id è autonomo: il collegamento con l'utente passa da
    //    profili.squadra_id, come previsto dallo schema.
    const { data: squadra, error: sqErr } = await admin
      .from('squadre')
      .upsert(
        {
          nome: nomeSquadra,
          slug,
          budget_iniziale: budget,
          crediti_residui: budget,
          slot_occupati: 0,
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (sqErr || !squadra) {
      dettagli.push(`Riga ${numeroRiga} (${nomeSquadra}): ${sqErr?.message ?? 'squadra non creata'}.`)
      continue
    }

    // 3. Collegamento profilo <-> squadra, che prima non veniva mai scritto.
    const { error: profErr } = await admin
      .from('profili')
      .upsert({ id: userId, squadra_id: squadra.id }, { onConflict: 'id' })

    if (profErr) {
      dettagli.push(`Riga ${numeroRiga} (${nomeSquadra}): profilo non collegato (${profErr.message}).`)
      continue
    }

    importate++
  }

  if (importate === 0) {
    return {
      error: `Nessuna squadra importata su ${righe.length} righe.`,
      dettagli,
    }
  }

  return {
    success: `${importate} squadre importate su ${righe.length} righe.`,
    dettagli: dettagli.length ? dettagli : undefined,
  }
}

// -----------------------------------------------------------------------------
// Listone giocatori + rose già assegnate
// -----------------------------------------------------------------------------

/**
 * Colonne attese (export Mantra di Euroleghe):
 *   # | Nome | Fuori lista | Sq. | Under | R. | R.MANTRA | ... | QUOT. | FantaSquadra | Costo
 *
 * Il listone contiene già `FantaSquadra` e `Costo` per i giocatori assegnati,
 * quindi un solo file basta a popolare sia il listone sia le rose iniziali:
 * l'import separato delle rose non serve più.
 */
export async function importListone(formData: FormData): Promise<RisultatoImport> {
  const negato = await assertSuperAdmin()
  if (negato) return { error: negato }

  let righe: Record<string, unknown>[]
  try {
    // Un foglio è un listone se ha un identificativo e un nome: sono le due
    // colonne senza le quali una riga verrebbe comunque scartata.
    righe = await leggiFoglio(formData, (colonne) =>
      (colonne.includes('#') || colonne.includes('id')) && colonne.includes('nome')
    )
  } catch (e) {
    return { error: (e as Error).message }
  }

  const ruoliValidi = new Set(['P', 'D', 'C', 'A'])
  // Json, non Record<string, unknown>: è il tipo che si accetta la RPC.
  const payload: Json[] = []
  const scartate: string[] = []

  for (const [indice, rawRow] of righe.entries()) {
    const riga = normalizzaChiavi(rawRow)
    const numeroRiga = indice + 2

    const id = numero(riga['#'] ?? riga['id'])
    const nome = testo(riga['nome'])
    const ruolo = testo(riga['r.'] ?? riga['r'] ?? riga['ruolo']).toUpperCase()

    if (id === null || !nome) {
      scartate.push(`Riga ${numeroRiga}: manca "#" o "Nome".`)
      continue
    }
    if (!ruoliValidi.has(ruolo)) {
      scartate.push(`Riga ${numeroRiga} (${nome}): ruolo "${ruolo}" non valido.`)
      continue
    }

    // "W/A", "Dd/Ds/Dc" -> array di ruoli Mantra
    const mantraGrezzo = testo(riga['r.mantra'] ?? riga['ruolo mantra'])
    const ruoloMantra = mantraGrezzo
      ? mantraGrezzo.split('/').map((r) => r.trim()).filter(Boolean)
      : null

    const costo = numero(riga['costo'])

    payload.push({
      id: Math.trunc(id),
      nome,
      ruolo,
      // La colonna "Under" dell'export contiene in realtà l'età.
      eta: numero(riga['under'] ?? riga['eta']),
      squadra: testo(riga['sq.'] ?? riga['sq'] ?? riga['squadra']),
      quotazione: Math.trunc(numero(riga['quot.'] ?? riga['quot'] ?? riga['quotazione']) ?? 1),
      ruolo_mantra: ruoloMantra,
      fuori_lista: testo(riga['fuori lista']).length > 0,
      fantasquadra: testo(riga['fantasquadra']),
      costo: costo === null ? 0 : Math.trunc(costo),
    })
  }

  if (payload.length === 0) {
    return { error: 'Nessuna riga valida nel file.', dettagli: scartate.slice(0, 20) }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('import_giocatori_batch', { payload })

  if (error) return { error: `Errore importazione: ${error.message}` }

  const esito = data as {
    giocatori: number
    tesseramenti: number
    squadre_non_trovate: string[]
  }

  const dettagli = [...scartate]
  if (esito?.squadre_non_trovate?.length) {
    // Segnalato esplicitamente invece di essere ignorato in silenzio: di solito
    // significa che i nomi in "FantaSquadra" non coincidono con quelli del
    // file budget.
    dettagli.push(
      `Fantasquadre non trovate a database: ${esito.squadre_non_trovate.join(', ')}.`
    )
  }

  return {
    success:
      `${esito?.giocatori ?? 0} giocatori importati, ` +
      `${esito?.tesseramenti ?? 0} tesseramenti creati.`,
    dettagli: dettagli.length ? dettagli : undefined,
  }
}

// -----------------------------------------------------------------------------
// Liste aste a chiamata
// -----------------------------------------------------------------------------

/**
 * Colonna A: id giocatore. Colonne successive: una per squadra, intestate con
 * il nome della fantasquadra; una cella non vuota significa che quella squadra
 * ha quel giocatore nella propria lista di chiamata.
 */
export async function importAste(formData: FormData): Promise<RisultatoImport> {
  const negato = await assertSuperAdmin()
  if (negato) return { error: negato }

  let righe: Record<string, unknown>[]
  try {
    righe = await leggiFoglio(formData)
  } catch (e) {
    return { error: (e as Error).message }
  }

  if (righe.length === 0) return { error: 'Il file è vuoto.' }

  const admin = createAdminClient()
  const { data: squadre, error: sqErr } = await admin.from('squadre').select('id, nome, slot_occupati')
  if (sqErr) return { error: `Impossibile leggere le squadre: ${sqErr.message}` }

  const { data: regole } = await admin.from('regole_lega').select('slot_totali').limit(1).maybeSingle()
  const slotTotali = regole?.slot_totali ?? 30

  const mappaSquadre = new Map<string, string>()
  const slotLiberiPerSquadra = new Map<string, number>()
  const nomePerId = new Map<string, string>()
  for (const s of squadre ?? []) {
    mappaSquadre.set(String(s.nome).toLowerCase().trim(), s.id as string)
    slotLiberiPerSquadra.set(s.id as string, slotTotali - (s.slot_occupati ?? 0))
    nomePerId.set(s.id as string, String(s.nome))
  }

  // L'unione delle colonne di TUTTE le righe, non quelle della prima.
  // `sheet_to_json` non produce una chiave per le celle vuote: se il primo
  // calciatore del file ha due contendenti, dedurre le colonne da lui
  // significa non leggere mai "utente 3" e seguenti, per nessuna riga. Il file
  // della lega arriva fino a "utente 5", e l'import ne perdeva 13 su 45 senza
  // segnalare nulla — il sito mostrava al massimo due contendenti.
  const intestazioni = [...new Set(righe.flatMap((r) => Object.keys(r)))]
  // La colonna dell'id: quella intestata "id", altrimenti la prima.
  const colonnaId = intestazioni.find((c) => c.toLowerCase().trim() === 'id') ?? intestazioni[0]
  const altreColonne = intestazioni.filter((c) => c !== colonnaId)

  const dettagli: string[] = []
  const abbinamenti = new Map<string, { giocatore_id: number; squadra_id: string }>()
  const nonRiconosciuti = new Map<string, number>()

  // Elenco degli id giocatore effettivamente a listone: senza questo controllo
  // un id inesistente farebbe fallire l'intero insert per violazione di FK.
  const { data: giocatori, error: gErr } = await admin.from('giocatori').select('id')
  if (gErr) return { error: `Impossibile leggere il listone: ${gErr.message}` }
  const idValidi = new Set((giocatori ?? []).map((g) => g.id as number))

  const idMancanti: number[] = []

  for (const [indice, riga] of righe.entries()) {
    const giocatoreId = numero(riga[colonnaId])
    if (giocatoreId === null) {
      dettagli.push(`Riga ${indice + 2}: id giocatore non valido.`)
      continue
    }
    const gid = Math.trunc(giocatoreId)

    if (!idValidi.has(gid)) {
      idMancanti.push(gid)
      continue
    }

    for (const colonna of altreColonne) {
      const valore = testo(riga[colonna])
      if (!valore) continue

      // Formato usato dal file della lega: le squadre stanno nei VALORI delle
      // celle, mentre le intestazioni sono generiche ("utente 1", "utente 2").
      let squadraId = mappaSquadre.get(valore.toLowerCase())

      // Formato alternativo: le squadre sono le INTESTAZIONI e la cella
      // contiene solo un segno di spunta.
      if (!squadraId) {
        squadraId = mappaSquadre.get(colonna.toLowerCase().trim())
      }

      if (squadraId) {
        // Una coppia giocatore-squadra va inserita una volta sola.
        abbinamenti.set(`${gid}|${squadraId}`, { giocatore_id: gid, squadra_id: squadraId })
      } else if (colonna.toLowerCase().trim() !== 'calciatore') {
        nonRiconosciuti.set(valore, (nonRiconosciuti.get(valore) ?? 0) + 1)
      }
    }
  }

  if (idMancanti.length > 0) {
    dettagli.push(
      `${idMancanti.length} id giocatore non presenti a listone (importa prima il listone): ${idMancanti.slice(0, 10).join(', ')}${idMancanti.length > 10 ? '…' : ''}.`
    )
  }

  if (nonRiconosciuti.size > 0) {
    dettagli.push(
      `Valori non riconosciuti come squadra: ${[...nonRiconosciuti.keys()].slice(0, 10).join(', ')}.`
    )
  }

  const elenco = [...abbinamenti.values()]
  if (elenco.length === 0) {
    return { error: 'Nessun abbinamento valido trovato nel file.', dettagli }
  }

  // Regola di lega: le chiamate di una squadra non possono superare i suoi slot
  // liberi, esattamente come nelle buste si sceglie un numero di giocatori pari
  // agli slot disponibili. Più chiamate che slot è quindi un errore nel file.
  //
  // Il controllo sta PRIMA della scrittura: rifiutare dopo aver già azzerato le
  // liste esistenti lascerebbe il database peggio di come si era trovato.
  const conteggioPerSquadra = new Map<string, number>()
  for (const a of elenco) {
    conteggioPerSquadra.set(a.squadra_id, (conteggioPerSquadra.get(a.squadra_id) ?? 0) + 1)
  }

  const eccedenze: string[] = []
  for (const [id, quante] of conteggioPerSquadra) {
    const liberi = slotLiberiPerSquadra.get(id) ?? slotTotali
    if (quante > liberi) {
      eccedenze.push(`${nomePerId.get(id)}: ${quante} chiamate ma ${liberi} slot liberi.`)
    }
  }

  if (eccedenze.length > 0) {
    return {
      error: 'Import annullato: alcune squadre hanno più chiamate che slot liberi. Le liste esistenti non sono state toccate.',
      dettagli: [...eccedenze, ...dettagli],
    }
  }

  // L'import sostituisce le liste esistenti, così ricaricare il file
  // corregge gli abbinamenti invece di accumularli.
  const { error: delErr } = await admin.from('liste_aste').delete().neq('giocatore_id', -1)
  if (delErr) return { error: `Impossibile azzerare le liste: ${delErr.message}`, dettagli }

  const { error: insErr } = await admin.from('liste_aste').insert(elenco)
  if (insErr) return { error: `Errore inserimento liste: ${insErr.message}`, dettagli }

  const squadreCoinvolte = new Set(elenco.map((a) => a.squadra_id)).size
  const giocatoriCoinvolti = new Set(elenco.map((a) => a.giocatore_id)).size

  return {
    success: `${elenco.length} abbinamenti importati: ${giocatoriCoinvolti} giocatori fra ${squadreCoinvolte} squadre.`,
    dettagli: dettagli.length ? dettagli : undefined,
  }
}

// -----------------------------------------------------------------------------
// Ricalcolo slot
// -----------------------------------------------------------------------------

/** Riallinea `squadre.slot_occupati` con il numero reale di tesseramenti. */
export async function ricalcolaSlot(): Promise<RisultatoImport> {
  const negato = await assertAdmin()
  if (negato) return { error: negato }

  const admin = createAdminClient()
  const { data: squadre, error } = await admin.from('squadre').select('id')
  if (error) return { error: error.message }

  let aggiornate = 0
  for (const squadra of squadre ?? []) {
    const { count } = await admin
      .from('tesseramenti')
      .select('id', { count: 'exact', head: true })
      .eq('squadra_id', squadra.id)

    const { error: updErr } = await admin
      .from('squadre')
      .update({ slot_occupati: count ?? 0 })
      .eq('id', squadra.id)

    if (!updErr) aggiornate++
  }

  return { success: `Slot ricalcolati per ${aggiornate} squadre.` }
}
