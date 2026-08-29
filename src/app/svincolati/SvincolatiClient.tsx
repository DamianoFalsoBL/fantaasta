'use client'
import { useState, useMemo } from 'react'
import MantraBadge from '@/components/MantraBadge'
import LogoSquadra from '@/components/LogoSquadra'
import OpzioniRuolo from '@/components/OpzioniRuolo'
import PannelloFiltri from '@/components/PannelloFiltri'
import { mantraPresenti } from '@/utils/ruoli'
import { passaFiltri } from '@/utils/filtri'
import { ordinaGiocatori, OPZIONI_ORDINE, type ColonnaOrdine, type Verso } from '@/utils/ordinamento'

type Colonna = ColonnaOrdine

// Le colonne di testo partono da A-Z, quelle numeriche dal valore più alto:
// è l'ordine che si cerca davvero aprendo una classifica. La freccia mostra
// sempre il verso corrente, quindi non c'è nulla da indovinare.
const VERSO_INIZIALE: Record<Colonna, Verso> = {
  nome: 'asc', ruolo: 'asc', squadra: 'asc', eta: 'asc', quotazione: 'desc',
}

const INTESTAZIONI: { colonna: Colonna; etichetta: string }[] = [
  { colonna: 'nome', etichetta: 'Nome' },
  { colonna: 'ruolo', etichetta: 'Ruoli' },
  { colonna: 'squadra', etichetta: 'Squadra' },
  { colonna: 'eta', etichetta: 'Età' },
  { colonna: 'quotazione', etichetta: 'Quotazione' },
]

export default function SvincolatiClient({ giocatori }: { giocatori: any[] }) {
  const [searchNome, setSearchNome] = useState('')
  const [searchSquadra, setSearchSquadra] = useState('')
  const [searchRuolo, setSearchRuolo] = useState('')
  const [searchEta, setSearchEta] = useState('')
  // Il valore iniziale non è una scelta: è l'ordine con cui la pagina server
  // consegna già i dati (`.order('nome')`), così l'aspetto non cambia da solo.
  const [colonna, setColonna] = useState<Colonna>('nome')
  const [verso, setVerso] = useState<Verso>('asc')

  const ordinaPer = (c: Colonna) => {
    if (c === colonna) setVerso(verso === 'asc' ? 'desc' : 'asc')
    else { setColonna(c); setVerso(VERSO_INIZIALE[c]) }
  }

  // Estrai tutte le squadre uniche per il filtro
  const squadreUniche = useMemo(() => {
    const sq = new Set(giocatori.map(g => g.squadra).filter(Boolean))
    return Array.from(sq).sort()
  }, [giocatori])

  // Solo i ruoli Mantra: i quattro reparti sono fissi e li elenca OpzioniRuolo.
  const ruoliMantra = useMemo(() => mantraPresenti(giocatori), [giocatori])

  // Filtra i giocatori
  //
  // Nome e ruolo passano da `passaFiltri`, che era stato scritto proprio per
  // unire le tre copie divergenti del filtro e qui era rimasto inutilizzato.
  // La differenza si vedeva: la ricerca libera cercava solo nel nome, mentre in
  // /buste cercava anche nella squadra reale. Stessa casella, due comportamenti
  // a seconda della pagina — e chi scriveva "Milan" qui non trovava nulla.
  //
  // La tendina *Squadra* resta e non è in conflitto: filtra per corrispondenza
  // esatta, la casella libera cerca un pezzo di testo. Valgono entrambe.
  const giocatoriFiltrati = useMemo(() => {
    return giocatori.filter(g => {
      const matchSquadra = searchSquadra === '' || g.squadra === searchSquadra
      const matchEta = searchEta === '' || (g.eta && g.eta <= parseInt(searchEta))

      return passaFiltri(g, searchNome, searchRuolo) && matchSquadra && matchEta
    })
  }, [giocatori, searchNome, searchSquadra, searchRuolo, searchEta])

  const giocatoriOrdinati = useMemo(
    () => ordinaGiocatori(giocatoriFiltrati, colonna, verso),
    [giocatoriFiltrati, colonna, verso])

  // Quanti filtri sono attivi oltre la ricerca: è il numero sul pulsante che
  // apre il pannello. L'ordinamento non conta, perché non nasconde righe.
  const filtriAttivi =
    (searchSquadra ? 1 : 0) + (searchRuolo ? 1 : 0) + (searchEta ? 1 : 0)

  const azzeraFiltri = () => {
    setSearchSquadra('')
    setSearchRuolo('')
    setSearchEta('')
  }

  return (
    <div className="p-3 sm:p-4">
      <PannelloFiltri
        attivi={filtriAttivi}
        onAzzera={azzeraFiltri}
        griglia="sm:grid-cols-2 md:grid-cols-4"
        ricerca={
          <>
            {/* Sul telefono l'etichetta resta solo per i lettori di schermo: il
                segnaposto dice gia' cosa ci va, e ventiquattro pixel in cima
                sono una riga di lista in fondo. */}
            <label htmlFor="f-nome" className="fm-label mb-1 block max-md:sr-only">Cerca per nome</label>
            <input
              id="f-nome"
              type="text"
              placeholder="Es. Barella…"
              className="fm-input"
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
            />
          </>
        }
      >
        <div>
          <label htmlFor="f-squadra" className="fm-label mb-1 block">Squadra</label>
          <select
            id="f-squadra"
            className="fm-select"
            value={searchSquadra}
            onChange={(e) => setSearchSquadra(e.target.value)}
          >
            <option value="">Tutte le squadre</option>
            {squadreUniche.map((sq: any) => (
              <option key={sq} value={sq}>{sq}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-ruolo" className="fm-label mb-1 block">Ruolo</label>
          <select
            id="f-ruolo"
            className="fm-select"
            value={searchRuolo}
            onChange={(e) => setSearchRuolo(e.target.value)}
          >
            <OpzioniRuolo presenti={ruoliMantra} />
          </select>
        </div>
        <div>
          <label htmlFor="f-eta" className="fm-label mb-1 block">Età (under max)</label>
          <input
            id="f-eta"
            type="number"
            placeholder="Es. 21"
            className="fm-input"
            value={searchEta}
            onChange={(e) => setSearchEta(e.target.value)}
          />
        </div>
        {/* Sotto md la tabella diventa una pila di schede e l'intestazione
            sparisce, quindi le colonne non sono più cliccabili: senza questa
            tendina l'ordinamento non esisterebbe proprio sul telefono, che è
            il dispositivo con cui la lista si consulta di più. */}
        <div className="md:hidden">
          <label htmlFor="f-ordine" className="fm-label mb-1 block">Ordina per</label>
          <select
            id="f-ordine"
            className="fm-select"
            value={`${colonna}:${verso}`}
            onChange={(e) => {
              const [c, v] = e.target.value.split(':')
              setColonna(c as Colonna)
              setVerso(v as Verso)
            }}
          >
            {OPZIONI_ORDINE.map((o) => (
              <option key={o.valore} value={o.valore}>{o.etichetta}</option>
            ))}
          </select>
        </div>
      </PannelloFiltri>

      {/* Tabella Svincolati */}
      <div className="fm-table-scroll rounded-md border border-line">
        <table className="fm-table fm-table-cards fm-table-compatta">
          <thead>
            <tr>
              {INTESTAZIONI.map(({ colonna: c, etichetta }) => (
                <th key={c} aria-sort={colonna === c ? (verso === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => ordinaPer(c)}
                    title={`Ordina per ${etichetta.toLowerCase()}`}
                    className="flex w-full items-center gap-1 uppercase tracking-[inherit] hover:text-ink"
                  >
                    {etichetta}
                    <span className={colonna === c ? 'text-neon' : 'text-ink-dim opacity-40'}>
                      {colonna === c ? (verso === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {giocatoriOrdinati.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-dim">
                  Nessun giocatore svincolato trovato con questi filtri.
                </td>
              </tr>
            ) : (
              // Sotto md le quattro celle marcate `fm-meta` si mettono in fila
              // sotto il nome, senza etichette: due righe invece di cinque.
              // L'unità dentro il valore — "27 anni", "9 cr" — sostituisce
              // l'etichetta sparita, e resta nascosta su desktop dove a dirlo
              // c'è già l'intestazione di colonna.
              giocatoriOrdinati.map((g) => (
                <tr key={g.id}>
                  <td data-label="Nome" className="fm-nome">{g.nome}</td>
                  <td data-label="Ruoli" className="fm-meta">
                    {/* `inline-flex` e non `flex`: dentro una cella `inline` un
                        figlio di tipo blocco spezzerebbe la riga compatta.

                        La lettera del reparto classico non si mostra più
                        accanto ai ruoli Mantra: è la stessa informazione detta
                        due volte, visto che Pc implica A e Dc implica D, e in
                        una riga stretta ruba spazio a quello che distingue
                        davvero un giocatore dall'altro.

                        Resta come ripiego quando i ruoli Mantra mancano, che
                        oggi non capita — verificato: 0 su 549 — ma capirebbe
                        con un listone in formato classico, e senza il ripiego
                        la colonna resterebbe vuota per tutti. */}
                    <span className="inline-flex items-center gap-2 align-middle">
                      {g.ruolo_mantra && g.ruolo_mantra.length > 0
                        ? <MantraBadge ruoli={g.ruolo_mantra} />
                        : <span className="text-ink-mid">{g.ruolo}</span>}
                    </span>
                  </td>
                  <td data-label="Squadra" className="fm-meta uppercase text-ink-mid">
                    {/* `inline-flex` come per i ruoli: dentro una cella che
                        sotto md diventa `inline`, un figlio di tipo blocco
                        spezzerebbe la riga compatta. */}
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <LogoSquadra squadra={g.squadra} />
                      {g.squadra}
                    </span>
                  </td>
                  <td data-label="Età" className="fm-meta tabular-nums text-ink-mid">
                    {g.eta ? <>{g.eta}<span className="md:hidden"> anni</span></> : '—'}
                  </td>
                  <td data-label="Quotazione" className="fm-meta tabular-nums">
                    <span className="fm-badge fm-badge-good align-middle">
                      {g.quotazione}<span className="md:hidden">&nbsp;cr</span>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-right">
        <span className="fm-label">
          Visualizzati {giocatoriOrdinati.length} su {giocatori.length}
        </span>
      </div>
    </div>
  )
}
