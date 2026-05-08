'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Producto, Categoria, SistemaInventario } from '@/types'
import { formatUSD, formatVES, usdToVes, vesToUsd } from '@/lib/utils/currency'
import { ImageUpload } from '@/components/admin/ImageUpload'

const EMPTY_FORM = {
  nombre: '',
  categoria_id: '',
  sistema_id: '',
  costo: '',
  precio: '',
  monedaIngreso: 'USD' as 'USD' | 'VES',
  costo_indexado_usd: false,
  monto_variable: false,
  comision_pct: '',
  cobra_comision_fija: true,
  activo: true,
  imagen_url: '' as string,
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [sistemas, setSistemas] = useState<SistemaInventario[]>([])
  const [tasa, setTasa] = useState<number>(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editando, setEditando] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  // Lista plana de productos en el mismo orden que la tabla (por categoría y nombre)
  const productosOrdenados = useMemo(() => {
    return Array.from(
      productos.reduce((map, p) => {
        const cat = p.categoria?.nombre ?? 'Sin categoría'
        if (!map.has(cat)) map.set(cat, [])
        map.get(cat)!.push(p)
        return map
      }, new Map<string, Producto[]>())
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, prods]) => prods.sort((a, b) => a.nombre.localeCompare(b.nombre)))
  }, [productos])

  useEffect(() => {
    cargarProductos()
    cargarCategorias()
    cargarTasa()
    cargarSistemas()
  }, [])

  async function cargarTasa() {
    const res = await fetch('/api/tasa/vigente')
    if (res.ok) {
      const data = await res.json()
      setTasa(data.tasa)
    }
  }

  async function cargarProductos() {
    const res = await fetch('/api/productos?activo=all')
    if (res.ok) setProductos(await res.json())
  }

  async function cargarSistemas() {
    const res = await fetch('/api/inventario')
    if (res.ok) setSistemas(await res.json())
  }

  async function cargarCategorias() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('categorias').select('*').eq('activa', true).order('nombre')
    if (data) setCategorias(data)
  }

  // Conversión en tiempo real según moneda de ingreso
  const costoNum = parseFloat(form.costo || '0') || 0
  const precioNum = parseFloat(form.precio || '0') || 0

  // Modo mixto: precio en VES, costo en USD
  const esModoMixto = form.monedaIngreso === 'VES' && form.costo_indexado_usd

  const costoUSD = esModoMixto ? costoNum : form.monedaIngreso === 'VES' ? vesToUsd(costoNum, tasa) : costoNum
  const precioUSD = form.monedaIngreso === 'VES' ? vesToUsd(precioNum, tasa) : precioNum
  const costoVES = esModoMixto ? usdToVes(costoNum, tasa) : form.monedaIngreso === 'USD' ? usdToVes(costoNum, tasa) : costoNum
  const precioVES = form.monedaIngreso === 'USD' ? usdToVes(precioNum, tasa) : precioNum
  const comision = form.monto_variable ? 0 : Math.max(0, precioUSD - costoUSD)

  function cambiarMoneda(nueva: 'USD' | 'VES') {
    if (nueva === form.monedaIngreso || !tasa) return
    // Al cambiar de moneda, limpiar costo_indexado_usd y convertir valores
    const nuevoCosto = nueva === 'VES'
      ? (costoUSD ? usdToVes(costoUSD, tasa).toFixed(2) : '')
      : (costoVES ? vesToUsd(costoVES, tasa).toFixed(4) : '')
    const nuevoPrecio = nueva === 'VES'
      ? (precioUSD ? usdToVes(precioUSD, tasa).toFixed(2) : '')
      : (precioVES ? vesToUsd(precioVES, tasa).toFixed(4) : '')
    setForm(f => ({ ...f, monedaIngreso: nueva, costo_indexado_usd: false, costo: nuevoCosto, precio: nuevoPrecio }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setMensaje('')

    if (!form.monto_variable && precioUSD < costoUSD) {
      setMensaje('El precio no puede ser menor al costo')
      setCargando(false)
      return
    }

    const esVes = form.monedaIngreso === 'VES'
    const pctNum = parseFloat(form.comision_pct || '0') || 0
    const payload = {
      nombre: form.nombre,
      categoria_id: form.categoria_id,
      sistema_id: form.sistema_id || null,
      monto_variable: form.monto_variable,
      activo: form.activo,
      imagen_url: form.imagen_url || null,
      moneda_precio: esVes ? 'VES' : 'USD',
      costo_indexado_usd: form.costo_indexado_usd,
      comision_pct: form.monto_variable ? (pctNum > 0 ? pctNum : null) : null,
      cobra_comision_fija: form.monto_variable ? form.cobra_comision_fija : true,
      // USD: costo en USD (también cuando es modo mixto VES precio / USD costo)
      costo_usd: form.monto_variable ? 0 : esVes && !esModoMixto ? 0 : costoUSD,
      precio_usd: form.monto_variable || esVes ? 0 : precioUSD,
      // VES fijo
      costo_ves: form.monto_variable || !esVes || esModoMixto ? null : costoNum,
      precio_ves: form.monto_variable || !esVes ? null : precioNum,
    }

    const url = editando ? `/api/productos/${editando}` : '/api/productos'
    const method = editando ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setMensaje(editando ? 'Producto actualizado' : 'Producto creado')
      if (editando) {
        // Mantener el formulario abierto al editar para agilizar edición múltiple
        await cargarProductos()
      } else {
        setForm(EMPTY_FORM)
        setEditando(null)
        setMostrarForm(false)
        cargarProductos()
      }
    } else {
      const data = await res.json()
      setMensaje(data.error ?? 'Error al guardar')
    }
    setCargando(false)
  }

  function iniciarEdicion(p: Producto) {
    const esVes = p.moneda_precio === 'VES'
    const esIndexado = esVes && p.costo_indexado_usd
    setForm({
      nombre: p.nombre,
      categoria_id: p.categoria_id,
      sistema_id: p.sistema_id ?? '',
      // Modo mixto: costo guardado en USD, precio en VES
      costo: esIndexado ? p.costo_usd.toString() : esVes ? (p.costo_ves ?? 0).toString() : p.costo_usd.toString(),
      precio: esVes ? (p.precio_ves ?? 0).toString() : p.precio_usd.toString(),
      monedaIngreso: esVes ? 'VES' : 'USD',
      costo_indexado_usd: !!p.costo_indexado_usd,
      monto_variable: p.monto_variable,
      comision_pct: p.comision_pct != null ? p.comision_pct.toString() : '',
      cobra_comision_fija: p.cobra_comision_fija !== false,
      activo: p.activo,
      imagen_url: p.imagen_url ?? '',
    })
    setEditando(p.id)
    setMostrarForm(true)
    setMensaje('')
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function toggleActivo(p: Producto) {
    await fetch(`/api/productos/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, activo: !p.activo }),
    })
    cargarProductos()
  }

  const inputCls = "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-amber-400">Productos</h1>
          {tasa > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Tasa vigente: {formatVES(tasa)} / USD</p>
          )}
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditando(null); setMostrarForm(true); setMensaje('') }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          + Nuevo producto
        </button>
      </div>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.includes('creado') || mensaje.includes('actualizado') ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje}
        </div>
      )}

      {/* Formulario */}
      {mostrarForm && (
        <div ref={formRef} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-100">{editando ? 'Editar producto' : 'Nuevo producto'}</h2>
            {editando && (() => {
              const idx = productosOrdenados.findIndex(p => p.id === editando)
              const prev = productosOrdenados[idx - 1]
              const next = productosOrdenados[idx + 1]
              return (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <button
                    type="button"
                    onClick={() => prev && iniciarEdicion(prev)}
                    disabled={!prev}
                    title={prev ? `← ${prev.nombre}` : undefined}
                    className="px-2.5 py-1 rounded-lg border border-gray-600 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ←
                  </button>
                  <span className="px-2 tabular-nums">{idx + 1} / {productosOrdenados.length}</span>
                  <button
                    type="button"
                    onClick={() => next && iniciarEdicion(next)}
                    disabled={!next}
                    title={next ? `${next.nombre} →` : undefined}
                    className="px-2.5 py-1 rounded-lg border border-gray-600 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    →
                  </button>
                </div>
              )
            })()}
          </div>

          {!tasa && (
            <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg px-3 py-2 text-xs text-yellow-300">
              ⚠️ No hay tasa del día cargada. Los precios se guardarán en USD sin conversión.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">

              {/* Nombre */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-300 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className={inputCls}
                  placeholder="Ej: Lotería de Táchira"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Categoría</label>
                <select
                  required
                  value={form.categoria_id}
                  onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Seleccionar...</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Sistema de inventario — solo para categorías sin inventario_unidades */}
              {(() => {
                const catSel = categorias.find(c => c.id === form.categoria_id)
                if (catSel?.inventario_unidades) {
                  return (
                    <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-300">
                      📦 Esta categoría crea un contador de unidades automáticamente por producto.
                    </div>
                  )
                }
                return (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Sistema de inventario</label>
                    <select
                      value={form.sistema_id}
                      onChange={e => setForm(f => ({ ...f, sistema_id: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Sin inventario</option>
                      {sistemas.filter(s => s.activo && (s.tipo === 'saldo_ves' || s.tipo === 'contador')).map(s => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                )
              })()}

              {/* Monto variable */}
              <div className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  id="monto_variable"
                  checked={form.monto_variable}
                  onChange={e => setForm(f => ({ ...f, monto_variable: e.target.checked, comision_pct: '' }))}
                  className="rounded"
                />
                <label htmlFor="monto_variable" className="text-sm text-gray-300">Monto variable</label>
              </div>

              {/* Comisión porcentual — solo para monto variable */}
              {form.monto_variable && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    % Comisión
                    <span className="ml-1 text-gray-500 font-normal">(deducida del monto ingresado)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.comision_pct}
                      onChange={e => setForm(f => ({ ...f, comision_pct: e.target.value }))}
                      className={inputCls}
                      placeholder="Ej: 4.31"
                    />
                    <span className="text-gray-400 text-sm shrink-0">%</span>
                  </div>
                  {form.comision_pct && parseFloat(form.comision_pct) > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Ej: 1.000 Bs. → comisión {(1000 * parseFloat(form.comision_pct) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs., costo {(1000 * (1 - parseFloat(form.comision_pct) / 100)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                    </p>
                  )}
                  {(!form.comision_pct || parseFloat(form.comision_pct) === 0) && (
                    <p className="text-xs text-gray-500 mt-1">Sin porcentaje: aplica comisión fija de 2ª capa (20%)</p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="cobra_comision_fija"
                      checked={form.cobra_comision_fija}
                      onChange={e => setForm(f => ({ ...f, cobra_comision_fija: e.target.checked }))}
                      className="rounded"
                    />
                    <label htmlFor="cobra_comision_fija" className="text-sm text-gray-300">
                      Aplica comisión fija 20%
                    </label>
                  </div>
                </div>
              )}

              {!form.monto_variable && (
                <>
                  {/* Selector de moneda de ingreso */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-2">Ingresar precios en</label>
                    <div className="flex gap-2">
                      {(['USD', 'VES'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => cambiarMoneda(m)}
                          disabled={!tasa && m === 'VES'}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            form.monedaIngreso === m
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {m === 'USD' ? 'USD ($)' : 'Bolívares (Bs.)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Checkbox costo indexado en USD — solo para precios VES */}
                  {form.monedaIngreso === 'VES' && (
                    <div className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="costo_indexado_usd"
                        checked={form.costo_indexado_usd}
                        onChange={e => setForm(f => ({ ...f, costo_indexado_usd: e.target.checked, costo: '' }))}
                        className="rounded"
                      />
                      <label htmlFor="costo_indexado_usd" className="text-sm text-gray-300">
                        Costo indexado en USD
                        <span className="ml-1.5 text-xs text-gray-500">(comisión varía según tasa del día)</span>
                      </label>
                    </div>
                  )}

                  {/* Costo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Costo {esModoMixto ? '(USD)' : form.monedaIngreso === 'USD' ? '(USD)' : '(Bs.)'}
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      required
                      value={form.costo}
                      onChange={e => setForm(f => ({ ...f, costo: e.target.value }))}
                      className={inputCls}
                      placeholder="0.00"
                    />
                    {tasa > 0 && form.costo && (
                      <p className="text-xs text-gray-400 mt-1">
                        = {esModoMixto ? formatVES(costoVES) : form.monedaIngreso === 'USD' ? formatVES(costoVES) : formatUSD(costoUSD)}
                      </p>
                    )}
                  </div>

                  {/* Precio */}
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Precio al cliente {form.monedaIngreso === 'USD' ? '(USD)' : '(Bs.)'}
                    </label>
                    <input
                      type="number"
                      step={esModoMixto ? '1' : '0.01'}
                      min="0"
                      required
                      value={form.precio}
                      onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                      className={inputCls}
                      placeholder={esModoMixto ? '80000' : '0.00'}
                    />
                    {tasa > 0 && form.precio && (
                      <p className="text-xs text-gray-400 mt-1">
                        = {form.monedaIngreso === 'USD' ? formatVES(precioVES) : formatUSD(precioUSD)}
                      </p>
                    )}
                  </div>

                  {/* Resumen */}
                  {(costoUSD > 0 || precioUSD > 0) && (
                    <div className="col-span-2 bg-gray-800 rounded-lg px-4 py-3 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Costo</p>
                        <p className="font-medium text-gray-100">{formatUSD(costoUSD)}</p>
                        <p className="text-xs text-gray-400">{formatVES(costoVES)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Precio</p>
                        <p className="font-medium text-gray-100">{formatUSD(precioUSD)}</p>
                        <p className="text-xs text-gray-400">{formatVES(precioVES)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Comisión</p>
                        {esModoMixto ? (
                          <p className="text-xs text-amber-300 italic">Varía con la tasa del día</p>
                        ) : (
                          <>
                            <p className={`font-medium ${comision < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                              {formatUSD(comision)}
                            </p>
                            <p className="text-xs text-gray-400">{formatVES(usdToVes(comision, tasa))}</p>
                          </>
                        )}
                        {esModoMixto && tasa > 0 && costoNum > 0 && precioNum > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Hoy: {formatUSD(Math.max(0, precioNum / tasa - costoNum))}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Activo */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activo"
                  checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="activo" className="text-sm text-gray-300">Activo</label>
              </div>

              {/* Imagen */}
              <div className="col-span-2">
                <ImageUpload
                  productoId={editando ?? undefined}
                  imagenActual={form.imagen_url || null}
                  onUpload={url => setForm(f => ({ ...f, imagen_url: url }))}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={cargando}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {cargando ? 'Guardando...' : editando ? 'Actualizar' : 'Crear producto'}
              </button>
              <button
                type="button"
                onClick={() => { setMostrarForm(false); setEditando(null); setForm(EMPTY_FORM) }}
                className="border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de productos */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Categoría</th>
              <th className="text-right px-4 py-3 font-medium text-gray-300">Costo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-300">Precio</th>
              <th className="text-right px-4 py-3 font-medium text-gray-300">Comisión</th>
              <th className="text-center px-4 py-3 font-medium text-gray-300">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {productos.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">Sin productos</td></tr>
            )}
            {Array.from(
              productos.reduce((map, p) => {
                const cat = p.categoria?.nombre ?? 'Sin categoría'
                if (!map.has(cat)) map.set(cat, [])
                map.get(cat)!.push(p)
                return map
              }, new Map<string, Producto[]>())
            ).sort(([a], [b]) => a.localeCompare(b)).flatMap(([cat, prods]) => [
              <tr key={`cat-${cat}`}>
                <td colSpan={7} className="px-4 py-2 bg-gray-800 border-t border-b border-gray-700">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">{cat}</span>
                </td>
              </tr>,
              ...prods.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => (
              <tr key={p.id} className={`hover:bg-gray-800 ${!p.activo ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-gray-300 font-bold text-sm shrink-0">
                        {p.nombre[0].toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-gray-100">
                      {p.nombre}
                      {p.monto_variable && <span className="ml-2 text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-700">variable</span>}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{p.categoria?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  {p.monto_variable ? '—' : p.costo_indexado_usd ? (
                    <span>
                      <span className="text-gray-200 font-medium">{formatUSD(p.costo_usd)}</span>
                      {tasa > 0 && <span className="block text-xs text-gray-500">{formatVES(usdToVes(p.costo_usd, tasa))}</span>}
                      <span className="block text-xs text-blue-400">idx USD</span>
                    </span>
                  ) : p.moneda_precio === 'VES' ? (
                    <span>
                      <span className="text-gray-200 font-medium">{formatVES(p.costo_ves ?? 0)}</span>
                      {tasa > 0 && <span className="block text-xs text-gray-500">{formatUSD((p.costo_ves ?? 0) / tasa)}</span>}
                    </span>
                  ) : (
                    <span>
                      <span className="text-gray-200 font-medium">{formatUSD(p.costo_usd)}</span>
                      {tasa > 0 && <span className="block text-xs text-gray-500">{formatVES(usdToVes(p.costo_usd, tasa))}</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.monto_variable ? '—' : p.moneda_precio === 'VES' ? (
                    <span>
                      <span className="font-semibold text-gray-100">{formatVES(p.precio_ves ?? 0)}</span>
                      {tasa > 0 && <span className="block text-xs text-gray-500">{formatUSD((p.precio_ves ?? 0) / tasa)}</span>}
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold text-gray-100">{formatUSD(p.precio_usd)}</span>
                      {tasa > 0 && <span className="block text-xs text-gray-500">{formatVES(usdToVes(p.precio_usd, tasa))}</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-amber-400">
                  {p.monto_variable ? (
                    p.comision_pct ? (
                      <span className="text-amber-300">{p.comision_pct}%</span>
                    ) : p.cobra_comision_fija !== false ? (
                      <span className="text-xs text-gray-500">20% fijo</span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )
                  ) : p.costo_indexado_usd ? (
                    <span>
                      <span className="italic text-xs text-amber-300">~tasa</span>
                      {tasa > 0 && (p.precio_ves ?? 0) > 0 && (
                        <span className="block text-xs">{formatUSD(Math.max(0, (p.precio_ves ?? 0) / tasa - p.costo_usd))}</span>
                      )}
                    </span>
                  ) : p.moneda_precio === 'VES'
                    ? formatVES(p.comision_ves ?? 0)
                    : formatUSD(p.comision_usd)
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActivo(p)} className={`text-xs px-2 py-1 rounded-full font-medium ${p.activo ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-gray-800 text-gray-500 border border-gray-600'}`}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => iniciarEdicion(p)} className="text-emerald-400 hover:underline text-xs">Editar</button>
                </td>
              </tr>
              ))
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}
