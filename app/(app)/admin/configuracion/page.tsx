'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ConfiguracionPage() {
  const [logoUrl, setLogoUrl] = useState('')
  const [preview, setPreview] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/configuracion')
      .then(r => r.json())
      .then(d => { setLogoUrl(d.logo_url ?? ''); setPreview(d.logo_url ?? '') })
  }, [])

  function mostrarMensaje(texto: string, tipo: 'ok' | 'error') {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  async function subirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      mostrarMensaje('Solo se permiten imágenes JPG, PNG o WebP', 'error')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      mostrarMensaje('La imagen no puede superar 2MB', 'error')
      return
    }
    setSubiendo(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `logo/logo.${ext}`
    const { error } = await supabase.storage
      .from('productos')
      .upload(path, file, { upsert: true })
    if (error) { mostrarMensaje('Error al subir imagen: ' + error.message, 'error'); setSubiendo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
    setLogoUrl(publicUrl)
    setPreview(publicUrl)
    setSubiendo(false)
    mostrarMensaje('Imagen cargada — guarda los cambios para aplicar', 'ok')
  }

  async function guardar() {
    setGuardando(true)
    const res = await fetch('/api/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: 'logo_url', valor: logoUrl }),
    })
    if (res.ok) mostrarMensaje('Configuración guardada', 'ok')
    else mostrarMensaje('Error al guardar', 'error')
    setGuardando(false)
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-100">Configuración del sistema</h1>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.tipo === 'ok' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-200">Logo del sistema</h2>
        <p className="text-xs text-gray-400">Imagen cuadrada recomendada. Se mostrará en la barra de navegación y en la pantalla de login. Máx. 2MB.</p>

        {/* Preview */}
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="Logo" className="w-20 h-20 rounded-xl object-cover border border-gray-600" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-800 border border-gray-600 flex items-center justify-center text-gray-500 text-xs">
              Sin logo
            </div>
          )}
          <div className="space-y-2">
            <label className="cursor-pointer inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 px-3 py-2 rounded-lg text-sm transition-colors">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={subirImagen} className="hidden" />
              {subiendo ? 'Subiendo...' : 'Seleccionar imagen'}
            </label>
            {preview && (
              <button onClick={() => { setPreview(''); setLogoUrl('') }}
                className="block text-xs text-red-400 hover:text-red-300 transition-colors">
                Quitar logo
              </button>
            )}
          </div>
        </div>

        {/* URL manual */}
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1">O pegar URL de imagen</label>
          <input
            type="text"
            value={logoUrl}
            onChange={e => { setLogoUrl(e.target.value); setPreview(e.target.value) }}
            placeholder="https://..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button onClick={guardar} disabled={guardando}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
