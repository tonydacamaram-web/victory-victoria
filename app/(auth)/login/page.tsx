'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MOTIVO_MSG: Record<string, string> = {
  inactividad:      'Tu sesión expiró por inactividad. Inicia sesión nuevamente.',
  otro_dispositivo: 'Tu sesión fue cerrada porque se inició sesión desde otro dispositivo.',
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [login, setLogin]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [aviso, setAviso]     = useState('')
  const [loading, setLoading] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')

  useEffect(() => {
    fetch('/api/configuracion')
      .then(r => r.ok ? r.json() : {})
      .then((d: Record<string, string>) => setLogoUrl(d.logo_url ?? ''))
      .catch(() => {})

    const motivo = searchParams.get('motivo')
    if (motivo && MOTIVO_MSG[motivo]) setAviso(MOTIVO_MSG[motivo])
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    let email = login.trim()

    if (!email.includes('@')) {
      const res = await fetch(`/api/auth/lookup?username=${encodeURIComponent(email)}`)
      if (!res.ok) {
        setError('Usuario no encontrado')
        setLoading(false)
        return
      }
      const data = await res.json()
      email = data.email
    }

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Credenciales inválidas')
      setLoading(false)
      return
    }

    // Crear sesión activa (invalida sesiones previas del usuario)
    const sesRes = await fetch('/api/auth/session', { method: 'POST' })
    if (!sesRes.ok) {
      console.warn('[login] No se pudo crear sesión personalizada')
    }

    router.push('/pos')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-cover mx-auto mb-4 border border-gray-700" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center mx-auto mb-4 border border-emerald-600">
              <span className="text-3xl font-bold text-amber-400">
                {(process.env.NEXT_PUBLIC_APP_NAME ?? 'L')[0]}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-amber-400">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'LoteríaPlus'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de caja</p>
        </div>

        {aviso && (
          <div className="mb-4 bg-amber-900/30 border border-amber-700 text-amber-300 rounded-lg px-3 py-2 text-sm text-center">
            {aviso}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Usuario o correo electrónico
            </label>
            <input
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="cajero1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
