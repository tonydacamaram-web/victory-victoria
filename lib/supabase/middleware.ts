import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── Configuración de sesión ────────────────────────────────────────────────
const SESSION_TIMEOUT_H  = parseInt(process.env.SESSION_TIMEOUT_HOURS ?? '4')
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_H * 60 * 60 * 1000
const SESSION_TIMEOUT_S  = SESSION_TIMEOUT_H * 60 * 60
const SESSION_COOKIE     = 'vv-sid'

const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/configuracion', '/_next/', '/favicon']
const isPublic   = (p: string) => PUBLIC_PREFIXES.some(pre => p.startsWith(pre))
const isApiRoute = (p: string) => p.startsWith('/api/')

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Refrescar cookies de sesión Supabase (requerido por @supabase/ssr) ──
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── Rutas públicas ──────────────────────────────────────────────────────
  if (isPublic(pathname)) {
    // No redirigir /login → /pos desde el middleware para evitar loops.
    // El formulario de login ya hace router.push('/pos') al autenticarse.
    return response
  }

  // ── Sin sesión Supabase → login ─────────────────────────────────────────
  if (!user) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  // ── Sin cookie de sesión propia → login ─────────────────────────────────
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Validación en BD (solo rutas de página, no API) ─────────────────────
  if (!isApiRoute(pathname)) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const cutoff       = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString()

    try {
      // PATCH condicional: actualiza last_activity si la sesión existe Y no expiró
      const params = new URLSearchParams({
        id:            `eq.${sessionId}`,
        last_activity: `gte.${cutoff}`,
        select:        'id',
      })

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sesiones_activas?${params}`,
        {
          method: 'PATCH',
          headers: {
            apikey:          SERVICE_KEY,
            Authorization:  `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer:          'return=representation',
          },
          body: JSON.stringify({ last_activity: new Date().toISOString() }),
        }
      )

      if (patchRes.ok) {
        const updated: { id: string }[] = await patchRes.json()

        if (updated.length === 0) {
          // Sesión expirada o eliminada — determinar motivo
          const checkRes = await fetch(
            `${SUPABASE_URL}/rest/v1/sesiones_activas?id=eq.${sessionId}&select=id`,
            {
              headers: {
                apikey:        SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
            }
          )
          const exists: { id: string }[] = checkRes.ok ? await checkRes.json() : []
          const motivo = exists.length > 0 ? 'inactividad' : 'otro_dispositivo'

          const loginUrl = new URL('/login', request.url)
          loginUrl.searchParams.set('motivo', motivo)
          const res = NextResponse.redirect(loginUrl)
          res.cookies.delete(SESSION_COOKIE)
          return res
        }
      }
      // Si la BD no responde: dejar pasar para no bloquear la app
    } catch {
      // Error de red → permitir paso
    }
  }

  // ── Refrescar cookie (ventana deslizante de inactividad) ─────────────────
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   SESSION_TIMEOUT_S,
    path:     '/',
  })

  return response
}
