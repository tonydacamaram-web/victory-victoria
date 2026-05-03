import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SESSION_TIMEOUT_S = parseInt(process.env.SESSION_TIMEOUT_HOURS ?? '4') * 60 * 60
const SESSION_COOKIE    = 'vv-sid'

// POST /api/auth/session
// Crea una sesión activa para el usuario autenticado.
// Elimina cualquier sesión previa del mismo usuario (1 sesión activa por usuario).
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const admin = createAdminClient()

    // Eliminar sesiones anteriores del usuario
    await admin.from('sesiones_activas').delete().eq('usuario_id', user.id)

    // Crear nueva sesión
    const { data: sesion, error } = await admin
      .from('sesiones_activas')
      .insert({
        usuario_id: user.id,
        user_agent: request.headers.get('user-agent') ?? null,
      })
      .select('id')
      .single()

    if (error || !sesion) throw error ?? new Error('No se pudo crear sesión')

    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, sesion.id, {
      httpOnly: true,
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   SESSION_TIMEOUT_S,
      path:     '/',
    })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear sesión'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
