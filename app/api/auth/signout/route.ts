import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'vv-sid'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId   = cookieStore.get(SESSION_COOKIE)?.value

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Eliminar sesión de la BD
  const admin = createAdminClient()
  if (sessionId) {
    await admin.from('sesiones_activas').delete().eq('id', sessionId)
  } else if (user) {
    // Fallback: eliminar por usuario si no hay cookie
    await admin.from('sesiones_activas').delete().eq('usuario_id', user.id)
  }

  await supabase.auth.signOut()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = NextResponse.redirect(new URL('/login', baseUrl), { status: 302 })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
