import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * Ripristino d'emergenza del SUPER_ADMIN.
 *
 * Era un endpoint completamente aperto: chiunque raggiungesse l'app poteva
 * chiamare /api/magic?email=... e ottenere SUPER_ADMIN, quindi anche
 * hard_reset_sistema. Per di più il confronto usava `startsWith`, così
 * `?email=a` bastava a promuovere un account qualsiasi che iniziasse per "a".
 *
 * Ora richiede il segreto MAGIC_RECOVERY_TOKEN in `.env.local` e confronta
 * l'email in modo esatto. Se la variabile non è impostata, l'endpoint è
 * disattivato.
 *
 * In condizioni normali non serve: il trigger su auth.users assegna
 * SUPER_ADMIN all'email configurata in regole_lega.super_admin_email, quindi
 * il ruolo si ripristina da solo anche dopo un hard reset.
 */
export async function GET(request: Request) {
  const atteso = process.env.MAGIC_RECOVERY_TOKEN

  if (!atteso) {
    return NextResponse.json(
      { error: 'Endpoint disattivato: MAGIC_RECOVERY_TOKEN non configurato.' },
      { status: 404 }
    )
  }

  const fornito = request.headers.get('x-recovery-token')
  if (fornito !== atteso) {
    return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 })
  }

  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Parametro "email" mancante.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: usersData, error: authError } = await admin.auth.admin.listUsers()
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const user = usersData?.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) {
    return NextResponse.json({ error: `Utente ${email} non trovato.` }, { status: 404 })
  }

  // Aggiorna solo il ruolo: `created_at` e `squadra_id` restano quelli esistenti.
  const { error: dbError } = await admin
    .from('profili')
    .upsert({ id: user.id, ruolo: 'SUPER_ADMIN' }, { onConflict: 'id' })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `${email} promosso a SUPER_ADMIN. Esegui logout e login.`,
  })
}
