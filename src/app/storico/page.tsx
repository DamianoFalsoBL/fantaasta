import { createClient } from '@/utils/supabase/server'
import MantraBadge from '@/components/MantraBadge'
import { requireUtente } from '@/utils/auth'

export const dynamic = 'force-dynamic'

export default async function StoricoPage() {
  // getUser() e non getSession(): lato server la sessione letta dai cookie
  // non è verificata.
  await requireUtente()
  const supabase = await createClient()

  const { data: asteChiuse, error } = await supabase
    .from('aste')
    .select('*, squadre!squadra_in_testa(nome), giocatori(nome, ruolo, ruolo_mantra, eta)')
    .eq('stato', 'CHIUSA')
    .not('squadra_in_testa', 'is', null)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="fm-title text-2xl sm:text-3xl">📜 Storico aste</h1>
        {asteChiuse && asteChiuse.length > 0 && (
          <span className="fm-chip">{asteChiuse.length} assegnazioni</span>
        )}
      </div>

      {error ? (
        <div className="fm-alert fm-alert-danger font-semibold">
          Errore nel caricamento dello storico: {error.message}
        </div>
      ) : asteChiuse && asteChiuse.length > 0 ? (
        <div className="fm-panel overflow-hidden">
          {/* Prima la tabella stava dentro un `overflow-hidden` senza scroll:
              a 375px era larga 777px in un contenitore da 343px, e le colonne
              Fantasquadra, Prezzo e Data venivano tagliate via senza alcun modo
              di raggiungerle. Ora sotto md diventa una scheda per riga. */}
          <table className="fm-table fm-table-cards">
            <thead>
              <tr>
                <th scope="col">Calciatore</th>
                <th scope="col">Ruolo</th>
                <th scope="col">Fantasquadra</th>
                <th scope="col" className="fm-num">Prezzo</th>
                <th scope="col">Data</th>
              </tr>
            </thead>
            <tbody>
              {asteChiuse.map((t) => (
                <tr key={t.id}>
                  <td data-label="Calciatore" className="fm-nome">
                    <span className="flex items-center gap-2">
                      {t.giocatori?.nome}
                      {t.giocatori?.eta ? <span className="fm-label">{t.giocatori?.eta}</span> : null}
                    </span>
                  </td>
                  <td data-label="Ruolo">
                    <span className="flex items-center justify-end gap-2 md:justify-start">
                      <span className="text-ink-mid">{t.giocatori?.ruolo}</span>
                      {t.giocatori?.ruolo_mantra && t.giocatori?.ruolo_mantra.length > 0 && <MantraBadge ruoli={t.giocatori?.ruolo_mantra} />}
                    </span>
                  </td>
                  <td data-label="Fantasquadra" className="font-semibold text-viola-hi">
                    {t.squadre?.nome}
                  </td>
                  <td data-label="Prezzo" className="fm-num">
                    <span className="fm-badge fm-badge-top">{t.prezzo_corrente}</span>
                  </td>
                  {/* Niente `whitespace-nowrap` qui: la data in formato italiano
                      è la cella più larga della tabella, e lasciarla andare a
                      capo è ciò che toglie lo sforamento su schermo stretto. */}
                  <td data-label="Data" className="text-ink-dim">
                    {new Date(t.scadenza_corrente || t.created_at).toLocaleString('it-IT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fm-panel p-10 text-center">
          <p className="text-ink-mid">Non è stata ancora assegnata alcuna asta.</p>
        </div>
      )}
    </div>
  )
}
