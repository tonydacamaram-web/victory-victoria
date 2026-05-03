'use client'

import { useState, useEffect } from 'react'
import { Categoria } from '@/types'

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nombre, setNombre] = useState('')
  const [cobraComision, setCobraComision] = useState(true)
  const [inventarioUnidades, setInventarioUnidades] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const res = await fetch('/api/categorias')
    if (res.ok) setCategorias(await res.json())
  }

  function mostrarMensaje(texto: string, tipo: 'ok' | 'error') {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setCargando(true)

    const payload = { nombre, cobra_comision: cobraComision, inventario_unidades: inventarioUnidades }

    if (editando) {
      const res = await fetch(`/api/categorias/${editando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        mostrarMensaje('Categoría actualizada', 'ok')
        cancelarEdicion()
        cargar()
      } else {
        const d = await res.json()
        mostrarMensaje(d.error ?? 'Error al actualizar', 'error')
      }
    } else {
      const res = await fetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        mostrarMensaje('Categoría creada', 'ok')
        setNombre('')
        setCobraComision(true)
        setInventarioUnidades(false)
        cargar()
      } else {
        const d = await res.json()
        mostrarMensaje(d.error ?? 'Error al crear', 'error')
      }
    }
    setCargando(false)
  }

  async function toggleActiva(cat: Categoria) {
    const res = await fetch(`/api/categorias/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activa: !cat.activa }),
    })
    if (res.ok) cargar()
  }

  async function toggleCobraComision(cat: Categoria) {
    const res = await fetch(`/api/categorias/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cobra_comision: !cat.cobra_comision }),
    })
    if (res.ok) cargar()
  }

  async function toggleInventarioUnidades(cat: Categoria) {
    const res = await fetch(`/api/categorias/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventario_unidades: !cat.inventario_unidades }),
    })
    if (res.ok) cargar()
  }

  async function eliminar(id: string) {
    const res = await fetch(`/api/categorias/${id}`, { method: 'DELETE' })
    if (res.ok) {
      mostrarMensaje('Categoría eliminada', 'ok')
      cargar()
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al eliminar', 'error')
    }
    setConfirmEliminar(null)
  }

  function iniciarEdicion(cat: Categoria) {
    setEditando(cat)
    setNombre(cat.nombre)
    setCobraComision(cat.cobra_comision)
    setInventarioUnidades(cat.inventario_unidades)
  }

  function cancelarEdicion() {
    setEditando(null)
    setNombre('')
    setCobraComision(true)
    setInventarioUnidades(false)
  }

  function Toggle({ value, onChange, colorOn = 'bg-amber-500' }: { value: boolean; onChange: () => void; colorOn?: string }) {
    return (
      <div onClick={onChange} className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${value ? colorOn : 'bg-gray-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-amber-400">Categorías</h1>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.tipo === 'ok' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
        <h2 className="font-medium text-gray-100">
          {editando ? `Editar: "${editando.nombre}"` : 'Nueva categoría'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Nombre de la categoría"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {/* Toggle comisión */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Toggle value={cobraComision} onChange={() => setCobraComision(v => !v)} colorOn="bg-amber-500" />
            <span className="text-sm text-gray-300">
              Cobra comisión{' '}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cobraComision ? 'bg-amber-900/50 text-amber-400' : 'bg-gray-800 text-gray-500'}`}>
                {cobraComision ? 'Sí' : 'No'}
              </span>
            </span>
          </label>

          {/* Toggle inventario por unidades */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <Toggle value={inventarioUnidades} onChange={() => setInventarioUnidades(v => !v)} colorOn="bg-blue-600" />
            <span className="text-sm text-gray-300">
              Inventario por unidad{' '}
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${inventarioUnidades ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
                {inventarioUnidades ? 'Sí' : 'No'}
              </span>
            </span>
          </label>
          {inventarioUnidades && (
            <p className="text-xs text-blue-400 bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-1.5">
              Cada producto en esta categoría tendrá su propio contador de unidades creado automáticamente.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={cargando || !nombre.trim()}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {cargando ? '...' : editando ? 'Guardar' : 'Agregar'}
            </button>
            {editando && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {categorias.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">Sin categorías</p>
        )}
        <ul className="divide-y divide-gray-700">
          {categorias.map(cat => (
            <li key={cat.id} className={`px-4 py-3 ${!cat.activa ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                {/* Nombre + badges */}
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-medium text-gray-100 capitalize">{cat.nombre}</span>

                  <button
                    onClick={() => toggleActiva(cat)}
                    title="Activar / Inactivar"
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${cat.activa ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700 hover:bg-emerald-900' : 'bg-gray-800 text-gray-500 border border-gray-600 hover:bg-gray-700'}`}
                  >
                    {cat.activa ? 'Activa' : 'Inactiva'}
                  </button>

                  <button
                    onClick={() => toggleCobraComision(cat)}
                    title="Activar / desactivar comisión"
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${cat.cobra_comision ? 'bg-amber-900/50 text-amber-400 border border-amber-700 hover:bg-amber-900' : 'bg-gray-800 text-gray-500 border border-gray-600 hover:bg-gray-700'}`}
                  >
                    {cat.cobra_comision ? '% Comisión' : 'Sin comisión'}
                  </button>

                  <button
                    onClick={() => toggleInventarioUnidades(cat)}
                    title="Inventario por unidad"
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${cat.inventario_unidades ? 'bg-blue-900/50 text-blue-400 border border-blue-700 hover:bg-blue-900' : 'bg-gray-800 text-gray-500 border border-gray-600 hover:bg-gray-700'}`}
                  >
                    {cat.inventario_unidades ? '📦 Uds. por prod.' : 'Sin inv. uds.'}
                  </button>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    onClick={() => iniciarEdicion(cat)}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Editar
                  </button>

                  {confirmEliminar === cat.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-400 font-medium">¿Eliminar?</span>
                      <button onClick={() => eliminar(cat.id)} className="text-xs px-2 py-1 rounded bg-red-700 text-white hover:bg-red-800 transition-colors">Sí</button>
                      <button onClick={() => setConfirmEliminar(null)} className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:bg-gray-700 transition-colors">No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmEliminar(cat.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
