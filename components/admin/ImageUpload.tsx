'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  productoId?: string
  imagenActual?: string | null
  onUpload: (url: string) => void
}

export function ImageUpload({ productoId, imagenActual, onUpload }: Props) {
  const [subiendo, setSubiendo] = useState(false)
  const [preview, setPreview] = useState<string | null>(imagenActual ?? null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validaciones
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG o WEBP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen no puede superar 2MB')
      return
    }

    setError('')
    setSubiendo(true)

    // Preview local inmediato
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `productos/${productoId ?? 'temp'}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('productos')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError('Error al subir la imagen: ' + uploadError.message)
      setSubiendo(false)
      return
    }

    const { data } = supabase.storage.from('productos').getPublicUrl(path)
    onUpload(data.publicUrl)
    setSubiendo(false)
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700">Imagen del producto</label>

      <div
        onClick={() => inputRef.current?.click()}
        className="relative cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-blue-400 transition-colors flex items-center gap-3"
      >
        {preview ? (
          <img
            src={preview}
            alt="preview"
            className="w-12 h-12 object-cover rounded-md shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-gray-400 text-xl">📷</span>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-gray-700">
            {subiendo ? 'Subiendo...' : preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
          </p>
          <p className="text-xs text-gray-400">JPG, PNG o WEBP · máx. 2MB</p>
        </div>
        {subiendo && (
          <div className="absolute inset-0 bg-white/70 rounded-lg flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
