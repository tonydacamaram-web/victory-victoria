'use client'

import { useState, useEffect } from 'react'
import { TasaCambio } from '@/types'
import { formatVES } from '@/lib/utils/currency'

export default function TasasPage() {
  const [tasa, setTasa] = useState<TasaCambio | null>(null)
  const [tasaManual, setTasaManual] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarTasaVigente()
  }, [])

  async function cargarTasaVigente() {
    const res = await fetch('/api/tasa/vigente')
    if (res.ok) setTasa(await res.json())
  }

  async function fetchBCV() {
    setCargando(true)
    setMensaje('')
    const res = await fetch('/api/tasa/fetch-bcv', { method: 'POST' })
    if (res.ok) {
      await cargarTasaVigente()
      setMensaje('Tasa BCV cargada correctamente')
    } else {
      setMensaje('No se pudo obtener la tasa automáticamente')
    }
    setCargando(false)
  }

  async function guardarManual(e: React.FormEvent) {
    e.preventDefault()
    const valor = parseFloat(tasaManual)
    if (!valor || valor <= 0) {
      setMensaje('Ingresa un valor válido')
      return
    }
    setCargando(true)
    setMensaje('')
    const res = await fetch('/api/tasa/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasa: valor }),
    })
    if (res.ok) {
      await cargarTasaVigente()
      setTasaManual('')
      setMensaje('Tasa guardada correctamente')
    } else {
      const data = await res.json()
      setMensaje(data.error ?? 'Error al guardar')
    }
    setCargando(false)
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-amber-400">Tasa de cambio BCV</h1>

      {/* Tasa vigente */}
      {tasa && (
        <div className={`rounded-xl border p-4 ${tasa.stale ? 'bg-amber-900/20 border-amber-700' : 'bg-emerald-900/20 border-emerald-700'}`}>
          <p className="text-sm text-gray-400 mb-1">Tasa vigente</p>
          <p className="text-2xl font-bold text-gray-100">{formatVES(tasa.tasa)} <span className="text-base font-normal text-gray-400">/ USD</span></p>
          <div className="flex gap-3 mt-2 text-xs text-gray-400">
            <span>Fuente: <strong className="text-gray-200">{tasa.fuente}</strong></span>
            <span>Fecha: <strong className="text-gray-200">{tasa.fecha_vigencia}</strong></span>
            {tasa.stale && <span className="text-amber-400 font-medium">⚠️ Tasa de otro día</span>}
          </div>
        </div>
      )}

      {!tasa && (
        <div className="rounded-xl border border-red-700 bg-red-900/40 p-4 text-sm text-red-300">
          No hay tasa cargada para hoy
        </div>
      )}

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.includes('correctamente') ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje}
        </div>
      )}

      {/* Cargar automático */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
        <h2 className="font-medium text-gray-100">Cargar desde BCV</h2>
        <p className="text-sm text-gray-400">Intenta obtener la tasa oficial automáticamente desde bcvapi.tech o bcv.org.ve</p>
        <button
          onClick={fetchBCV}
          disabled={cargando}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {cargando ? 'Cargando...' : 'Obtener tasa BCV'}
        </button>
      </div>

      {/* Ingreso manual */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
        <h2 className="font-medium text-gray-100">Ingresar manualmente</h2>
        <form onSubmit={guardarManual} className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="1"
            placeholder="Ej: 92.50"
            value={tasaManual}
            onChange={e => setTasaManual(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="flex items-center text-sm text-gray-400">Bs./USD</span>
          <button
            type="submit"
            disabled={cargando || !tasaManual}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Guardar
          </button>
        </form>
      </div>
    </div>
  )
}
