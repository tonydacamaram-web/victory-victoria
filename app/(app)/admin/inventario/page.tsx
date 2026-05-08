'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SistemaInventario, MovimientoInventario, Producto } from '@/types'
import { formatVES, formatUSD } from '@/lib/utils/currency'

export default function InventarioPage() {
  const [sistemas, setSistemas] = useState<SistemaInventario[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([])

  const [filtroSistema, setFiltroSistema] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [sortCol, setSortCol] = useState<'fecha' | 'sistema' | 'tipo' | 'cantidad' | 'turno'>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)

  // Modal de carga
  const [modalSistema, setModalSistema] = useState<SistemaInventario | null>(null)
  const [montoCarga, setMontoCarga] = useState('')
  const [descCarga, setDescCarga] = useState('')
  const [turnoModal, setTurnoModal] = useState<1 | 2>(1)
  const [guardando, setGuardando] = useState(false)

  // Mapa sistema_id → nombre de categoría (inferido desde productos)
  const sistemaCategoria = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of productos) {
      if (p.sistema_id && p.categoria?.nombre) {
        map.set(p.sistema_id, p.categoria.nombre)
      }
    }
    return map
  }, [productos])

  // Sistemas agrupados por categoría, ordenados alfabéticamente
  const sistemasAgrupados = useMemo(() => {
    const groups = new Map<string, SistemaInventario[]>()
    for (const s of sistemas) {
      const cat = sistemaCategoria.get(s.id) ?? 'Sin categoría'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(s)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, sisList]) => ({
        cat,
        sisList: sisList.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
  }, [sistemas, sistemaCategoria])

  const cargarSistemas = useCallback(async () => {
    const res = await fetch('/api/inventario')
    if (res.ok) setSistemas(await res.json())
  }, [])

  const cargarMovimientos = useCallback(async () => {
    const params = new URLSearchParams({ limit: '300' })
    if (filtroSistema) params.set('sistema_id', filtroSistema)
    if (filtroDesde) params.set('desde', filtroDesde)
    if (filtroHasta) params.set('hasta', filtroHasta + 'T23:59:59')
    const res = await fetch(`/api/inventario/movimientos?${params}`)
    if (res.ok) setMovimientos(await res.json())
  }, [filtroSistema, filtroDesde, filtroHasta])

  useEffect(() => {
    cargarSistemas()
    fetch('/api/productos?activo=all').then(r => { if (r.ok) r.json().then(setProductos) })
  }, [cargarSistemas])

  useEffect(() => {
    cargarMovimientos()
  }, [cargarMovimientos])

  const movimientosFiltrados = useMemo(() => {
    let list = [...movimientos]

    if (filtroTipo) list = list.filter(m => m.tipo === filtroTipo)

    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.toLowerCase()
      list = list.filter(m =>
        (m.sistema as { nombre: string } | undefined)?.nombre?.toLowerCase().includes(q) ||
        m.descripcion?.toLowerCase().includes(q) ||
        (m.usuario as { nombre: string } | undefined)?.nombre?.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortCol === 'fecha')    { va = a.created_at; vb = b.created_at }
      else if (sortCol === 'sistema') {
        va = (a.sistema as { nombre: string } | undefined)?.nombre ?? ''
        vb = (b.sistema as { nombre: string } | undefined)?.nombre ?? ''
      }
      else if (sortCol === 'tipo')     { va = a.tipo; vb = b.tipo }
      else if (sortCol === 'cantidad') { va = Math.abs(a.cantidad); vb = Math.abs(b.cantidad) }
      else if (sortCol === 'turno')    { va = a.turno ?? 0; vb = b.turno ?? 0 }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [movimientos, filtroTipo, filtroBusqueda, sortCol, sortDir])

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function mostrarMensaje(texto: string, tipo: 'ok' | 'error') {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  const [cambiandoTipo, setCambiandoTipo] = useState<string | null>(null)
  const [resetConfirm, setResetConfirm] = useState<string | null>(null)
  const [resetAllConfirm, setResetAllConfirm] = useState(false)

  async function cambiarTipo(sis: SistemaInventario, nuevoTipo: 'saldo_ves' | 'unidades' | 'contador') {
    if (nuevoTipo === sis.tipo) return
    setCambiandoTipo(sis.id)
    const res = await fetch(`/api/inventario/${sis.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: nuevoTipo }),
    })
    if (res.ok) {
      await cargarSistemas()
      const label = nuevoTipo === 'saldo_ves' ? 'Bs.' : nuevoTipo === 'unidades' ? 'Unidades' : 'Contador'
      mostrarMensaje(`${sis.nombre}: unidad cambiada a ${label}`, 'ok')
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al cambiar tipo', 'error')
    }
    setCambiandoTipo(null)
  }

  async function resetSistema(sis: SistemaInventario) {
    const res = await fetch(`/api/inventario/${sis.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    setResetConfirm(null)
    if (res.ok) {
      await cargarSistemas()
      mostrarMensaje(`${sis.nombre}: restablecido a 0`, 'ok')
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al restablecer', 'error')
    }
  }

  async function resetTodo() {
    const res = await fetch('/api/inventario', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_all: true }),
    })
    setResetAllConfirm(false)
    if (res.ok) {
      await cargarSistemas()
      mostrarMensaje('Todos los sistemas restablecidos a 0', 'ok')
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al restablecer', 'error')
    }
  }

  async function registrarCarga(e: React.FormEvent) {
    e.preventDefault()
    if (!modalSistema) return
    const cantidad = parseFloat(montoCarga)
    if (!cantidad || cantidad === 0) return
    setGuardando(true)

    const res = await fetch(`/api/inventario/${modalSistema.id}/carga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad, descripcion: descCarga, turno: modalSistema.tipo === 'contador' ? undefined : turnoModal }),
    })

    if (res.ok) {
      mostrarMensaje(`Carga registrada en ${modalSistema.nombre}`, 'ok')
      setModalSistema(null)
      setMontoCarga('')
      setDescCarga('')
      await cargarSistemas()
      await cargarMovimientos()
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al registrar carga', 'error')
    }
    setGuardando(false)
  }

  function fmtSaldo(sis: SistemaInventario, amount: number) {
    if (sis.tipo === 'unidades') return `${Math.floor(amount)} uds.`
    return sis.moneda === 'USD' ? formatUSD(amount) : formatVES(amount)
  }

  async function cambiarMoneda(sis: SistemaInventario, moneda: 'VES' | 'USD') {
    if (moneda === sis.moneda) return
    const res = await fetch(`/api/inventario/${sis.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moneda }),
    })
    if (res.ok) {
      await cargarSistemas()
      mostrarMensaje(`${sis.nombre}: moneda cambiada a ${moneda}`, 'ok')
    }
  }

  const inputCls = "w-full bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">Inventario</h1>
        {resetAllConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">¿Restablecer todos a 0?</span>
            <button
              onClick={resetTodo}
              className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Confirmar
            </button>
            <button
              onClick={() => setResetAllConfirm(false)}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setResetAllConfirm(true)}
            className="text-xs border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            ↺ Restablecer todo
          </button>
        )}
      </div>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.tipo === 'ok' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Tarjetas de sistemas agrupadas por categoría */}
      <div className="space-y-5">
        {sistemasAgrupados.map(({ cat, sisList }) => (
          <div key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">{cat}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sisList.map(sis => {
                const esContador = sis.tipo === 'contador'
                const umbral = sis.tipo === 'unidades' ? 10 : 5000
                const bajo = esContador ? false
                  : sis.saldo_turno_1 <= umbral || sis.saldo_turno_2 <= umbral
                return (
                  <div key={sis.id} className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-2 ${bajo ? 'border-orange-700' : esContador ? 'border-blue-800' : 'border-gray-700'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">{sis.nombre}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {esContador ? 'Total acum.' : sis.tipo === 'unidades' ? 'Unidades' : sis.moneda === 'USD' ? 'Saldo USD' : 'Saldo Bs.'}
                        </p>
                      </div>
                      {bajo && (
                        <span className="text-xs bg-orange-900/50 text-orange-400 border border-orange-700 px-1.5 py-0.5 rounded-full shrink-0">
                          Bajo
                        </span>
                      )}
                      {esContador && (
                        <span className="text-xs bg-blue-900/50 text-blue-400 border border-blue-700 px-1.5 py-0.5 rounded-full shrink-0">
                          Contador
                        </span>
                      )}
                    </div>
                    {esContador ? (
                      <p className="text-lg font-bold text-gray-100">{fmtSaldo(sis, sis.saldo_actual)}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className="bg-amber-900/20 border border-amber-800 rounded-lg px-2 py-1">
                          <p className="text-amber-500 font-semibold mb-0.5">T1</p>
                          <p className={`font-bold ${sis.saldo_turno_1 <= 0 ? 'text-red-400' : 'text-amber-300'}`}>
                            {fmtSaldo(sis, sis.saldo_turno_1)}
                          </p>
                        </div>
                        <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-2 py-1">
                          <p className="text-blue-500 font-semibold mb-0.5">T2</p>
                          <p className={`font-bold ${sis.saldo_turno_2 <= 0 ? 'text-red-400' : 'text-blue-300'}`}>
                            {fmtSaldo(sis, sis.saldo_turno_2)}
                          </p>
                        </div>
                      </div>
                    )}
                    {resetConfirm === sis.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => resetSistema(sis)}
                          className="flex-1 text-xs bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded font-medium transition-colors"
                        >
                          Confirmar reset
                        </button>
                        <button
                          onClick={() => setResetConfirm(null)}
                          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResetConfirm(sis.id)}
                        title="Restablecer a 0"
                        className="w-full text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-800 rounded-lg py-1 transition-colors"
                      >
                        ↺ Restablecer a 0
                      </button>
                    )}
                    <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
                      {([
                        { value: 'saldo_ves', label: 'Bs.' },
                        { value: 'unidades', label: 'Uds.' },
                        { value: 'contador', label: 'Cont.' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          disabled={cambiandoTipo === sis.id}
                          onClick={() => cambiarTipo(sis, value)}
                          className={`flex-1 py-1 font-medium transition-colors ${
                            sis.tipo === value
                              ? value === 'saldo_ves'
                                ? 'bg-emerald-700 text-white'
                                : value === 'unidades'
                                ? 'bg-amber-700 text-white'
                                : 'bg-blue-700 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {sis.tipo !== 'unidades' && (
                      <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
                        {(['VES', 'USD'] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => cambiarMoneda(sis, m)}
                            className={`flex-1 py-1 font-medium transition-colors ${
                              sis.moneda === m
                                ? m === 'VES' ? 'bg-emerald-700 text-white' : 'bg-indigo-700 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => { setModalSistema(sis); setMontoCarga(''); setDescCarga(''); setTurnoModal(1) }}
                      className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-xs py-1.5 rounded-lg font-medium transition-colors"
                    >
                      + Cargar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Historial de movimientos */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-100 text-sm">Historial de movimientos</h2>
            <span className="text-xs text-gray-500 ml-auto">{movimientosFiltrados.length} registros</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Búsqueda de texto */}
            <input
              type="text"
              placeholder="Buscar sistema, descripción, usuario…"
              value={filtroBusqueda}
              onChange={e => setFiltroBusqueda(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1 min-w-[160px]"
            />
            {/* Filtro sistema */}
            <select
              value={filtroSistema}
              onChange={e => setFiltroSistema(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todos los sistemas</option>
              {sistemas.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            {/* Filtro tipo */}
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todos los tipos</option>
              <option value="carga">Carga</option>
              <option value="venta">Venta</option>
              <option value="ajuste">Ajuste</option>
              <option value="cierre">Cierre</option>
            </select>
            {/* Rango de fechas */}
            <input
              type="date"
              value={filtroDesde}
              onChange={e => setFiltroDesde(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="date"
              value={filtroHasta}
              onChange={e => setFiltroHasta(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {(filtroDesde || filtroHasta || filtroTipo || filtroBusqueda || filtroSistema) && (
              <button
                onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setFiltroTipo(''); setFiltroBusqueda(''); setFiltroSistema('') }}
                className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              {([
                { col: 'fecha',    label: 'Fecha',       align: 'left'   },
                { col: 'sistema',  label: 'Sistema',     align: 'left'   },
                { col: 'tipo',     label: 'Tipo',        align: 'left'   },
                { col: 'cantidad', label: 'Cantidad',    align: 'right'  },
                { col: 'turno',    label: 'Turno',       align: 'center' },
              ] as const).map(({ col, label, align }) => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className={`px-4 py-2.5 text-xs font-medium text-gray-300 cursor-pointer select-none hover:text-gray-100 transition-colors text-${align}`}
                >
                  {label}{' '}
                  <span className="text-gray-500">
                    {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </th>
              ))}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-300">Descripción</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-300">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {movimientosFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500 text-sm">Sin movimientos</td>
              </tr>
            )}
            {movimientosFiltrados.map(mov => {
              const esEntrada = mov.cantidad > 0
              const sis = sistemas.find(s => s.id === mov.sistema_id)
              return (
                <tr key={mov.id} className="hover:bg-gray-800">
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {new Date(mov.created_at).toLocaleString('es-VE')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-amber-400">
                      {(mov.sistema as { nombre: string } | undefined)?.nombre ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                      mov.tipo === 'carga'
                        ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                        : mov.tipo === 'venta'
                        ? 'bg-blue-900/40 text-blue-400 border-blue-700'
                        : mov.tipo === 'cierre'
                        ? 'bg-red-900/40 text-red-400 border-red-700'
                        : 'bg-amber-900/40 text-amber-400 border-amber-700'
                    }`}>
                      {mov.tipo === 'carga' ? 'Carga' : mov.tipo === 'venta' ? 'Venta' : mov.tipo === 'cierre' ? 'Cierre' : 'Ajuste'}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold text-sm ${esEntrada ? 'text-emerald-400' : 'text-red-400'}`}>
                    {esEntrada ? '+' : ''}{sis?.tipo === 'unidades'
                      ? `${Math.abs(mov.cantidad)} uds.`
                      : sis?.moneda === 'USD'
                      ? formatUSD(Math.abs(mov.cantidad))
                      : formatVES(Math.abs(mov.cantidad))
                    }
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {mov.turno ? (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        mov.turno === 1 ? 'bg-amber-900/40 text-amber-400' : 'bg-blue-900/40 text-blue-400'
                      }`}>{mov.turno === 1 ? 'T1' : 'T2'}</span>
                    ) : <span className="text-xs text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {mov.descripcion ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {(mov.usuario as { nombre: string } | undefined)?.nombre ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de carga */}
      {modalSistema && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-100">
              Cargar {modalSistema.nombre}
            </h3>
            {modalSistema.tipo === 'contador' ? (
              <p className="text-xs text-gray-400">
                Total acumulado:{' '}
                <span className="font-semibold text-amber-400">{formatVES(modalSistema.saldo_actual)}</span>
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-amber-900/20 border border-amber-800 rounded-lg px-2 py-1.5">
                  <p className="text-amber-500 font-semibold">T1 Mañana</p>
                  <p className="font-bold text-amber-300">
                    {modalSistema.tipo === 'unidades' ? `${Math.floor(modalSistema.saldo_turno_1)} uds.` : formatVES(modalSistema.saldo_turno_1)}
                  </p>
                </div>
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-2 py-1.5">
                  <p className="text-blue-500 font-semibold">T2 Tarde</p>
                  <p className="font-bold text-blue-300">
                    {modalSistema.tipo === 'unidades' ? `${Math.floor(modalSistema.saldo_turno_2)} uds.` : formatVES(modalSistema.saldo_turno_2)}
                  </p>
                </div>
              </div>
            )}
            <form onSubmit={registrarCarga} className="space-y-3">
              {modalSistema.tipo !== 'contador' && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-2">Cargar en turno</label>
                  <div className="flex gap-2">
                    {([1, 2] as const).map(t => (
                      <button key={t} type="button" onClick={() => setTurnoModal(t)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          turnoModal === t
                            ? t === 1 ? 'bg-amber-600 text-white border-amber-600' : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                        }`}>
                        {t === 1 ? 'T1 – Mañana' : 'T2 – Tarde'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  {modalSistema.tipo === 'unidades' ? 'Cantidad (negativo = ajuste)' : 'Monto (negativo = ajuste)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={montoCarga}
                  onChange={e => setMontoCarga(e.target.value)}
                  placeholder={modalSistema.tipo === 'saldo_ves' ? 'Ej: 5000.00 o -500.00' : 'Ej: 100 o -10'}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  value={descCarga}
                  onChange={e => setDescCarga(e.target.value)}
                  placeholder="Ej: Recarga del día"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={guardando || !montoCarga}
                  className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {guardando ? 'Guardando...' : 'Confirmar carga'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalSistema(null)}
                  className="flex-1 border border-gray-600 text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
