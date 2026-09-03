'use client'
import { useState, useMemo } from 'react'
import RuoliGiocatore from '@/components/RuoliGiocatore'
import StellaPreferito from '@/components/StellaPreferito'
import LogoSquadra from '@/components/LogoSquadra'
import SceltaRuoli from '@/components/SceltaRuoli'
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

export default function SvincolatiClient({
  giocatori,
  squadraId,
  preferitiIniziali,
  preferitiNonDisponibili,
}: {
  giocatori: any[]
  /** Nullo per il super admin, che non ha squadra: niente stelle. */
  squadraId: string | null
  preferitiIniziali: number[]
  /** Quanti preferiti non compaiono più in lista perché non sono più liberi. */
  preferitiNonDisponibili: number
}) {
  const [searchNome, setSearchNome] = useState('')
  const [searchSquadra, setSearchSquadra] = useState('')
  // Un elenco e non una stringa: si filtra per piu' ruoli insieme, con la
  // regola «almeno uno» (vedi `ruoloCorrisponde`).
  const [searchRuolo, setSearchRuolo] = useState<string[]>([])
  const [searchEta, setSearchEta] = useState('')
  // Il valore iniziale non è una scelta libera: **deve combaciare con l'ordine
  // con cui la pagina server consegna i dati**
  // (`.order('quotazione', { ascending: false })`), altrimenti l'elenco si
  // riordina da sé un istante dopo il caricamento.
  const [colonna, setColonna] = useState<Colonna>('quotazione')
  const [verso, setVerso] = useState<Verso>('desc')
  // Un Set e non un array: la stella si disegna 215 volte e ogni riga chiede
  // "ci sono dentro?".
  const [preferiti, setPreferiti] = useState<Set<number>>(new Set(preferitiIniziali))
  const [soloPreferiti, setSoloPreferiti] = useState(false)

  const cambiaPreferito = (id: number, ora: boolean) => {
    setPreferiti((prima) => {
      const dopo = new Set(prima)
      if (ora) dopo.add(id)
      else dopo.delete(id)
      return dopo
    })
  }

  const ordinaPer = (c: Colonna) => {
    if (c === colonna) setVerso(verso === 'asc' ? 'desc' : 'asc')
    else { setColonna(c); setVerso(VERSO_INIZIALE[c]) }
  }

  // Estrai tutte le squadre uniche per il filtro
  const squadreUniche = useMemo(() => {
    const sq = new Set(giocatori.map(g => g.squadra).filter(Boolean))
    return Array.from(sq).sort()
  }, [giocatori])

  // Solo i ruoli Mantra: i quattro reparti sono fissi e li elenca SceltaRuoli.
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
      const matchPreferiti = !soloPreferiti || preferiti.has(g.id)

      return passaFiltri(g, searchNome, searchRuolo) && matchSquadra && matchEta && matchPreferiti
    })
  }, [giocatori, searchNome, searchSquadra, searchRuolo, searchEta, soloPreferiti, preferiti])

  const giocatoriOrdinati = useMemo(
    () => ordinaGiocatori(giocatoriFiltrati, colonna, verso),
    [giocatoriFiltrati, colonna, verso])

  // Quanti filtri sono attivi oltre la ricerca: è il numero sul pulsante che
  // apre il pannello. L'ordinamento non conta, perché non nasconde righe.
  const filtriAttivi =
    (searchSquadra ? 1 : 0) + (searchRuolo.length > 0 ? 1 : 0) + (searchEta ? 1 : 0) + (soloPreferiti ? 1 : 0)

  const azzeraFiltri = () => {
    setSearchSquadra('')
    setSearchRuolo([])
    setSearchEta('')
    setSoloPreferiti(false)
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
          <SceltaRuoli
            id="f-ruolo"
            scelti={searchRuolo}
            onCambia={setSearchRuolo}
            presenti={ruoliMantra}
          />
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
        {squadraId && (
          <div className="flex flex-wrap items-center gap-3 md:col-span-full">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-mid">
              <input
                type="checkbox"
                className="rounded"
                checked={soloPreferiti}
                onChange={(e) => setSoloPreferiti(e.target.checked)}
              />
              Solo i preferiti
              <span className="fm-badge fm-badge-mid">{preferiti.size}</span>
            </label>
            {/* Una stella non è una busta: senza questa riga qualcuno
                preparerebbe la lista e crederebbe di aver già consegnato. */}
            <span className="text-xs text-ink-dim">
              La lista è solo tua e non vale come busta: si consegna da
              <strong className="text-ink-mid"> Buste</strong>.
            </span>
          </div>
        )}

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

      {/* Un preferito che finisce in coda per l'asta sparisce da questa lista,
          perche' la pagina mostra solo chi e' davvero prendibile. Senza questa
          riga il manager conterebbe dieci preferiti e ne troverebbe otto,
          scoprendolo al momento peggiore. */}
      {soloPreferiti && preferitiNonDisponibili > 0 && (
        <div className="fm-alert fm-alert-warn mb-4 text-sm">
          {preferitiNonDisponibili === 1
            ? 'Un giocatore fra i tuoi preferiti non è più disponibile: è stato preso, o è in coda per l’asta.'
            : `${preferitiNonDisponibili} giocatori fra i tuoi preferiti non sono più disponibili: sono stati presi, o sono in coda per l’asta.`}
        </div>
      )}

      {/* Tabella Svincolati */}
      <div className="fm-table-scroll rounded-md border border-line">
        {/* Le tracce valgono solo sotto md, dove la riga diventa una griglia.
            L'ordine è quello delle colonne: ruoli, squadra, età, quotazione. */}
        <table
          className="fm-table fm-table-cards fm-table-compatta fm-table-incolonnata"
          style={{ '--fm-colonne': '5.9rem minmax(0, 1fr) 1.4rem 2.7rem' } as React.CSSProperties}
        >
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
                  {/* La stella sta DENTRO la cella del nome e non in una
                      colonna sua: le tracce della griglia mobile sono calibrate
                      al pixel (5.9rem, 1fr, 1.4rem, 2.7rem, misurate su 215
                      righe a 360px) e una quinta colonna le farebbe saltare
                      tutte. Qui finisce in fondo alla colonna Nome su schermo
                      grande e in fondo alla riga del titolo sul telefono, che
                      e' a tutta larghezza. */}
                  <td data-label="Nome" className="fm-nome">
                    {/* `w-full`: senza, lo span si dimensiona sul contenuto e
                        la stella finisce attaccata al nome, a un'ascissa
                        diversa per ogni riga. All'estremità si trova sempre
                        nello stesso punto, che è come si scorre una lista. */}
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{g.nome}</span>
                      {squadraId && (
                        <StellaPreferito
                          giocatoreId={g.id}
                          squadraId={squadraId}
                          nome={g.nome}
                          attiva={preferiti.has(g.id)}
                          onCambia={cambiaPreferito}
                        />
                      )}
                    </span>
                  </td>
                  <td data-label="Ruoli" className="fm-meta">
                    {/* `inline-flex` e non `flex`: dentro una cella `inline` un
                        figlio di tipo blocco spezzerebbe la riga compatta. */}
                    <span className="inline-flex items-center gap-2 align-middle">
                      <RuoliGiocatore ruolo={g.ruolo} ruoloMantra={g.ruolo_mantra} />
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
                    {g.eta ? <>{g.eta}<span className="sr-only"> anni</span></> : '—'}
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
