'use client'

import { useState, useEffect } from 'react'
import type { PremioLoteria } from '@/types'
import { formatVES } from '@/lib/utils/currency'

interface FilaLoteria {
  producto_id: string
  nombre: string
  vendidos: number
  vendidos_t1: number
  vendidos_t2: number
  ingreso_ves: number
  ingreso_ves_t1: number
  ingreso_ves_t2: number
  comision_ves: number
  comision_ves_t1: number
  comision_ves_t2: number
}

const TZ = 'America/Caracas'

function fechaHoyVET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function fuenteBadge(p: PremioLoteria) {
  if (p.fuente === 'externo') {
    const metodo = p.metodo_externo === 'pago_movil' ? 'Pago Móvil' : 'Efectivo'
    return (
      <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-1.5 py-0.5 rounded">
        Externo · {metodo}
      </span>
    )
  }
  return (
    <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.5 rounded">
      Caja
    </span>
  )
}

function turnoBadge(turno: 1 | 2 | null | undefined) {
  if (!turno) return null
  return (
    <span className="text-xs bg-gray-700 text-gray-300 border border-gray-600 px-1.5 py-0.5 rounded">
      T{turno}
    </span>
  )
}

export default function LoteriaPage() {
  const [filas, setFilas] = useState<FilaLoteria[]>([])
  const [premios, setPremios] = useState<PremioLoteria[]>([])
  const [totalVentasVes, setTotalVentasVes] = useState(0)
  const [totalComisionesVes, setTotalComisionesVes] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [desde, setDesde] = useState(() => fechaHoyVET())
  const [hasta, setHasta] = useState(() => fechaHoyVET())
  const [cajaId, setCajaId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRol, setUserRol] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Modal registrar premio
  const [modalPremio, setModalPremio] = useState(false)
  const [premioProductoId, setPremioProductoId] = useState('')
  const [premioTicket, setPremioTicket] = useState('')
  const [premioMoneda, setPremioMoneda] = useState<'USD' | 'VES'>('VES')
  const [premioMonto, setPremioMonto] = useState('')
  const [premioFuente, setPremioFuente] = useState<'caja' | 'externo'>('caja')
  const [premioMetodoExterno, setPremioMetodoExterno] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [premioObs, setPremioObs] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  // Eliminar premio
  const [eliminando, setEliminando] = useState<PremioLoteria | null>(null)
  const [eliminandoGuardando, setEliminandoGuardando] = useState(false)

  // Modal editar premio
  const [editando, setEditando] = useState<PremioLoteria | null>(null)
  const [editProductoId, setEditProductoId] = useState('')
  const [editTicket, setEditTicket] = useState('')
  const [editMoneda, setEditMoneda] = useState<'USD' | 'VES'>('VES')
  const [editMonto, setEditMonto] = useState('')
  const [editFuente, setEditFuente] = useState<'caja' | 'externo'>('caja')
  const [editMetodo, setEditMetodo] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [editObs, setEditObs] = useState('')
  const [editGuardando, setEditGuardando] = useState(false)
  const [errorEdit, setErrorEdit] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.ok ? r.json() : null),
      fetch('/api/cajas').then(r => r.ok ? r.json() : null),
    ]).then(([me, caja]) => {
      if (me?.id) { setUserId(me.id); setUserRol(me.rol) }
      if (caja?.id) setCajaId(caja.id)
    })
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ desde, hasta })
      const [rResumen, rPremios] = await Promise.all([
        fetch(`/api/loteria/resumen?${params}`).then(r => r.json()),
        fetch(`/api/loteria/premios?${params}`).then(r => r.json()),
      ])
      setFilas(rResumen.filas ?? [])
      setTotalVentasVes(rResumen.total_ventas_ves ?? 0)
      setTotalComisionesVes(rResumen.total_comisiones_ves ?? 0)
      setPremios(Array.isArray(rPremios) ? rPremios : [])
    } catch {
      setError('No se pudieron cargar los datos')
    } finally {
      setCargando(false)
    }
  }

  async function recargarPremios() {
    const params = new URLSearchParams({ desde, hasta })
    const data = await fetch(`/api/loteria/premios?${params}`).then(r => r.json())
    setPremios(Array.isArray(data) ? data : [])
  }

  async function registrarPremio() {
    setErrorModal(null)
    if (!cajaId) { setErrorModal('No hay caja activa'); return }
    if (!premioProductoId) { setErrorModal('Selecciona el sistema de lotería'); return }
    if (!premioTicket.trim()) { setErrorModal('Ingresa el número de ticket premiado'); return }
    if (!premioMonto || parseFloat(premioMonto) <= 0) { setErrorModal('Ingresa un monto válido'); return }
    setGuardando(true)
    try {
      const r = await fetch('/api/loteria/premios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caja_id: cajaId,
          producto_id: premioProductoId,
          numero_ticket: premioTicket.trim(),
          moneda: premioMoneda,
          monto: parseFloat(premioMonto),
          observaciones: premioObs || null,
          fuente: premioFuente,
          metodo_externo: premioFuente === 'externo' ? premioMetodoExterno : null,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setErrorModal(data.error ?? 'Error al registrar premio'); return }
      setModalPremio(false)
      setPremioProductoId(''); setPremioTicket(''); setPremioMoneda('VES')
      setPremioMonto(''); setPremioFuente('caja'); setPremioMetodoExterno('efectivo'); setPremioObs('')
      await recargarPremios()
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return
    setEliminandoGuardando(true)
    try {
      const r = await fetch(`/api/loteria/premios/${eliminando.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) { alert(data.error ?? 'Error al eliminar'); return }
      setEliminando(null)
      await recargarPremios()
    } finally {
      setEliminandoGuardando(false)
    }
  }

  function abrirEdicion(p: PremioLoteria) {
    setEditando(p)
    setEditProductoId(p.producto_id ?? '')
    setEditTicket(p.numero_ticket ?? '')
    setEditMoneda(p.moneda)
    setEditMonto(String(p.monto))
    setEditFuente(p.fuente)
    setEditMetodo(p.metodo_externo ?? 'efectivo')
    setEditObs(p.observaciones ?? '')
    setErrorEdit(null)
  }

  async function guardarEdicion() {
    if (!editando) return
    setErrorEdit(null)
    if (!editTicket.trim()) { setErrorEdit('El número de ticket es obligatorio'); return }
    if (!editMonto || parseFloat(editMonto) <= 0) { setErrorEdit('El monto debe ser mayor a cero'); return }
    setEditGuardando(true)
    try {
      const r = await fetch(`/api/loteria/premios/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: editProductoId || null,
          numero_ticket: editTicket.trim(),
          moneda: editMoneda,
          monto: parseFloat(editMonto),
          fuente: editFuente,
          metodo_externo: editFuente === 'externo' ? editMetodo : null,
          observaciones: editObs || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setErrorEdit(data.error ?? 'Error al guardar'); return }
      setEditando(null)
      await recargarPremios()
    } finally {
      setEditGuardando(false)
    }
  }

  const puedeEditar = (p: PremioLoteria) =>
    userRol === 'admin' || userRol === 'supervisor' || p.caja?.usuario_id === userId

  // Totales T1 / T2 — ventas
  const totalT1 = filas.reduce((s, f) => s + f.vendidos_t1, 0)
  const totalT2 = filas.reduce((s, f) => s + f.vendidos_t2, 0)
  const totalIngresoT1 = filas.reduce((s, f) => s + f.ingreso_ves_t1, 0)
  const totalIngresoT2 = filas.reduce((s, f) => s + f.ingreso_ves_t2, 0)
  const totalComisionT1 = filas.reduce((s, f) => s + f.comision_ves_t1, 0)
  const totalComisionT2 = filas.reduce((s, f) => s + f.comision_ves_t2, 0)

  // Premios por turno — separados por fuente
  // Solo "caja" se resta de las ventas; "externo" es solo informativo
  const cajaPremios  = premios.filter(p => p.fuente === 'caja')
  const extPremios   = premios.filter(p => p.fuente === 'externo')

  const cajaPremiosVes    = cajaPremios.filter(p => p.moneda === 'VES').reduce((s, p) => s + p.monto, 0)
  const cajaPremiosUsd    = cajaPremios.filter(p => p.moneda === 'USD').reduce((s, p) => s + p.monto, 0)
  const cajaPremiosVesT1  = cajaPremios.filter(p => p.moneda === 'VES' && p.caja?.turno === 1).reduce((s, p) => s + p.monto, 0)
  const cajaPremiosVesT2  = cajaPremios.filter(p => p.moneda === 'VES' && p.caja?.turno === 2).reduce((s, p) => s + p.monto, 0)
  const cajaPremiosUsdT1  = cajaPremios.filter(p => p.moneda === 'USD' && p.caja?.turno === 1).reduce((s, p) => s + p.monto, 0)
  const cajaPremiosUsdT2  = cajaPremios.filter(p => p.moneda === 'USD' && p.caja?.turno === 2).reduce((s, p) => s + p.monto, 0)

  const extPremiosVes     = extPremios.filter(p => p.moneda === 'VES').reduce((s, p) => s + p.monto, 0)
  const extPremiosUsd     = extPremios.filter(p => p.moneda === 'USD').reduce((s, p) => s + p.monto, 0)
  const extPremiosVesT1   = extPremios.filter(p => p.moneda === 'VES' && p.caja?.turno === 1).reduce((s, p) => s + p.monto, 0)
  const extPremiosVesT2   = extPremios.filter(p => p.moneda === 'VES' && p.caja?.turno === 2).reduce((s, p) => s + p.monto, 0)
  const extPremiosUsdT1   = extPremios.filter(p => p.moneda === 'USD' && p.caja?.turno === 1).reduce((s, p) => s + p.monto, 0)
  const extPremiosUsdT2   = extPremios.filter(p => p.moneda === 'USD' && p.caja?.turno === 2).reduce((s, p) => s + p.monto, 0)

  const hayCajaPremios = cajaPremiosVes > 0 || cajaPremiosUsd > 0
  const hayExtPremios  = extPremiosVes > 0 || extPremiosUsd > 0

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <h1 className="text-xl font-bold text-amber-400">Lotería</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <button onClick={cargar} disabled={cargando}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
          {cargando ? 'Cargando...' : 'Buscar'}
        </button>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Ventas Bs.</p>
          <p className="text-xl font-bold text-blue-400">{formatVES(totalVentasVes)}</p>
          {(totalIngresoT1 > 0 || totalIngresoT2 > 0) && (
            <p className="text-xs text-gray-500 mt-1">
              {totalIngresoT1 > 0 && <span className="text-blue-400/60 mr-2">T1 {formatVES(totalIngresoT1)}</span>}
              {totalIngresoT2 > 0 && <span className="text-purple-400/60">T2 {formatVES(totalIngresoT2)}</span>}
            </p>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Comisiones Bs.</p>
          <p className="text-xl font-bold text-amber-400">{formatVES(totalComisionesVes)}</p>
        </div>
        {hayCajaPremios && (
          <div className="bg-gray-900 border border-red-800/40 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Premios de caja</p>
            {cajaPremiosVes > 0 && (
              <>
                <p className="text-xl font-bold text-red-400">{formatVES(cajaPremiosVes)}</p>
                {(cajaPremiosVesT1 > 0 || cajaPremiosVesT2 > 0) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {cajaPremiosVesT1 > 0 && <span className="text-red-400/60 mr-2">T1 {formatVES(cajaPremiosVesT1)}</span>}
                    {cajaPremiosVesT2 > 0 && <span className="text-red-400/60">T2 {formatVES(cajaPremiosVesT2)}</span>}
                  </p>
                )}
              </>
            )}
            {cajaPremiosUsd > 0 && (
              <>
                <p className={`font-bold text-red-300 ${cajaPremiosVes > 0 ? 'text-sm mt-1' : 'text-xl'}`}>${cajaPremiosUsd.toFixed(2)} USD</p>
                {(cajaPremiosUsdT1 > 0 || cajaPremiosUsdT2 > 0) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {cajaPremiosUsdT1 > 0 && <span className="text-red-300/60 mr-2">T1 ${cajaPremiosUsdT1.toFixed(2)}</span>}
                    {cajaPremiosUsdT2 > 0 && <span className="text-red-300/60">T2 ${cajaPremiosUsdT2.toFixed(2)}</span>}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {hayCajaPremios && cajaPremiosVes > 0 && (
          <div className="bg-gray-900 border border-emerald-800/40 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Neto Bs.</p>
            <p className="text-xl font-bold text-emerald-400">{formatVES(totalVentasVes - cajaPremiosVes)}</p>
            {(totalIngresoT1 > 0 || totalIngresoT2 > 0) && (
              <p className="text-xs text-gray-500 mt-1">
                {totalIngresoT1 > 0 && <span className="text-emerald-400/60 mr-2">T1 {formatVES(totalIngresoT1 - cajaPremiosVesT1)}</span>}
                {totalIngresoT2 > 0 && <span className="text-emerald-400/60">T2 {formatVES(totalIngresoT2 - cajaPremiosVesT2)}</span>}
              </p>
            )}
          </div>
        )}
        {hayExtPremios && (
          <div className="col-span-2 bg-gray-900 border border-yellow-800/30 rounded-xl p-4">
            <p className="text-xs text-yellow-500/80 font-medium mb-2">Premios fondo externo <span className="text-gray-500 font-normal">(informativo — no se restan de ventas)</span></p>
            <div className="flex gap-6 flex-wrap">
              {extPremiosVes > 0 && (
                <div>
                  <span className="text-sm font-bold text-yellow-400">{formatVES(extPremiosVes)}</span>
                  {(extPremiosVesT1 > 0 || extPremiosVesT2 > 0) && (
                    <span className="text-xs text-gray-500 ml-2">
                      {extPremiosVesT1 > 0 && <span className="mr-1">T1 {formatVES(extPremiosVesT1)}</span>}
                      {extPremiosVesT2 > 0 && <span>T2 {formatVES(extPremiosVesT2)}</span>}
                    </span>
                  )}
                </div>
              )}
              {extPremiosUsd > 0 && (
                <div>
                  <span className="text-sm font-bold text-yellow-300">${extPremiosUsd.toFixed(2)} USD</span>
                  {(extPremiosUsdT1 > 0 || extPremiosUsdT2 > 0) && (
                    <span className="text-xs text-gray-500 ml-2">
                      {extPremiosUsdT1 > 0 && <span className="mr-1">T1 ${extPremiosUsdT1.toFixed(2)}</span>}
                      {extPremiosUsdT2 > 0 && <span>T2 ${extPremiosUsdT2.toFixed(2)}</span>}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabla de productos con desglose T1/T2 */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">Ventas por producto</h2>
        </div>
        {filas.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">
            {cargando ? 'Cargando...' : 'Sin ventas en este período'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs" rowSpan={2}>Producto</th>
                  <th className="text-center px-2 py-1 font-medium text-gray-400 text-xs border-b border-gray-700" colSpan={3}>Vendidos</th>
                  <th className="text-center px-2 py-1 font-medium text-gray-400 text-xs border-b border-gray-700" colSpan={3}>Ingreso Bs.</th>
                  <th className="text-center px-2 py-1 font-medium text-gray-400 text-xs border-b border-gray-700" colSpan={3}>Comisión Bs.</th>
                </tr>
                <tr>
                  <th className="text-right px-2 py-1 font-medium text-gray-500 text-xs">Total</th>
                  <th className="text-right px-2 py-1 font-medium text-blue-500/70 text-xs">T1</th>
                  <th className="text-right px-2 py-1 font-medium text-purple-500/70 text-xs">T2</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-500 text-xs">Total</th>
                  <th className="text-right px-2 py-1 font-medium text-blue-500/70 text-xs">T1</th>
                  <th className="text-right px-2 py-1 font-medium text-purple-500/70 text-xs">T2</th>
                  <th className="text-right px-2 py-1 font-medium text-gray-500 text-xs">Total</th>
                  <th className="text-right px-2 py-1 font-medium text-blue-500/70 text-xs">T1</th>
                  <th className="text-right px-2 py-1 font-medium text-purple-500/70 text-xs">T2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filas.map(f => (
                  <tr key={f.producto_id} className="hover:bg-gray-800">
                    <td className="px-4 py-2 text-gray-100">{f.nombre}</td>
                    <td className="px-2 py-2 text-right font-bold text-gray-100">{f.vendidos}</td>
                    <td className="px-2 py-2 text-right text-blue-400/80 text-xs">{f.vendidos_t1 > 0 ? f.vendidos_t1 : '—'}</td>
                    <td className="px-2 py-2 text-right text-purple-400/80 text-xs">{f.vendidos_t2 > 0 ? f.vendidos_t2 : '—'}</td>
                    <td className="px-2 py-2 text-right text-blue-400 text-xs">{formatVES(f.ingreso_ves)}</td>
                    <td className="px-2 py-2 text-right text-blue-400/60 text-xs">{f.ingreso_ves_t1 > 0 ? formatVES(f.ingreso_ves_t1) : '—'}</td>
                    <td className="px-2 py-2 text-right text-purple-400/60 text-xs">{f.ingreso_ves_t2 > 0 ? formatVES(f.ingreso_ves_t2) : '—'}</td>
                    <td className="px-2 py-2 text-right text-amber-400 text-xs">{formatVES(f.comision_ves)}</td>
                    <td className="px-2 py-2 text-right text-amber-400/60 text-xs">{f.comision_ves_t1 > 0 ? formatVES(f.comision_ves_t1) : '—'}</td>
                    <td className="px-2 py-2 text-right text-orange-400/60 text-xs">{f.comision_ves_t2 > 0 ? formatVES(f.comision_ves_t2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-800 border-t border-gray-700">
                <tr>
                  <td className="px-4 py-2 text-xs font-semibold text-gray-300">Total</td>
                  <td className="px-2 py-2 text-right text-sm font-bold text-gray-100">{filas.reduce((s, f) => s + f.vendidos, 0)}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-blue-400/80">{totalT1 > 0 ? totalT1 : '—'}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-purple-400/80">{totalT2 > 0 ? totalT2 : '—'}</td>
                  <td className="px-2 py-2 text-right text-sm font-bold text-blue-400">{formatVES(totalVentasVes)}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-blue-400/60">{totalIngresoT1 > 0 ? formatVES(totalIngresoT1) : '—'}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-purple-400/60">{totalIngresoT2 > 0 ? formatVES(totalIngresoT2) : '—'}</td>
                  <td className="px-2 py-2 text-right text-sm font-bold text-amber-400">{formatVES(totalComisionesVes)}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-amber-400/60">{totalComisionT1 > 0 ? formatVES(totalComisionT1) : '—'}</td>
                  <td className="px-2 py-2 text-right text-xs font-semibold text-orange-400/60">{totalComisionT2 > 0 ? formatVES(totalComisionT2) : '—'}</td>
                </tr>
                {hayCajaPremios && (
                  <tr className="border-t border-gray-600">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-red-400">Premios de caja</td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-red-400">
                      {cajaPremiosVes > 0 && <div>{formatVES(cajaPremiosVes)}</div>}
                      {cajaPremiosUsd > 0 && <div className="text-red-300">${cajaPremiosUsd.toFixed(2)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-red-400/70">
                      {cajaPremiosVesT1 > 0 ? <div>{formatVES(cajaPremiosVesT1)}</div> : '—'}
                      {cajaPremiosUsdT1 > 0 && <div className="text-red-300/70">${cajaPremiosUsdT1.toFixed(2)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-red-400/70">
                      {cajaPremiosVesT2 > 0 ? <div>{formatVES(cajaPremiosVesT2)}</div> : '—'}
                      {cajaPremiosUsdT2 > 0 && <div className="text-red-300/70">${cajaPremiosUsdT2.toFixed(2)}</div>}
                    </td>
                    <td colSpan={3} className="px-2 py-2 text-center text-xs text-gray-600">—</td>
                  </tr>
                )}
                {hayCajaPremios && cajaPremiosVes > 0 && (
                  <tr className="border-t border-gray-600 bg-emerald-900/10">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-emerald-400">Neto Bs.</td>
                    <td className="px-2 py-2 text-right text-sm font-bold text-emerald-400">{formatVES(totalVentasVes - cajaPremiosVes)}</td>
                    <td className="px-2 py-2 text-right text-xs font-semibold text-emerald-400/70">
                      {(totalIngresoT1 > 0 || cajaPremiosVesT1 > 0) ? formatVES(totalIngresoT1 - cajaPremiosVesT1) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-semibold text-emerald-400/70">
                      {(totalIngresoT2 > 0 || cajaPremiosVesT2 > 0) ? formatVES(totalIngresoT2 - cajaPremiosVesT2) : '—'}
                    </td>
                    <td colSpan={3} className="px-2 py-2 text-center text-xs text-gray-600">—</td>
                  </tr>
                )}
                {hayExtPremios && (
                  <tr className="border-t border-yellow-800/30">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-yellow-500/80">
                      Premios externos <span className="text-gray-600 font-normal">(inf.)</span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs font-bold text-yellow-400/70">
                      {extPremiosVes > 0 && <div>{formatVES(extPremiosVes)}</div>}
                      {extPremiosUsd > 0 && <div className="text-yellow-300/70">${extPremiosUsd.toFixed(2)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-yellow-400/50">
                      {extPremiosVesT1 > 0 ? <div>{formatVES(extPremiosVesT1)}</div> : '—'}
                      {extPremiosUsdT1 > 0 && <div className="text-yellow-300/50">${extPremiosUsdT1.toFixed(2)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-yellow-400/50">
                      {extPremiosVesT2 > 0 ? <div>{formatVES(extPremiosVesT2)}</div> : '—'}
                      {extPremiosUsdT2 > 0 && <div className="text-yellow-300/50">${extPremiosUsdT2.toFixed(2)}</div>}
                    </td>
                    <td colSpan={3} className="px-2 py-2 text-center text-xs text-gray-600">—</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Premios del período */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Premios del período</h2>
          <button onClick={() => { setModalPremio(true); setErrorModal(null) }}
            className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
            + Registrar Premio
          </button>
        </div>
        {premios.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-6">Sin premios registrados en este período</p>
        ) : (
          <div className="divide-y divide-gray-700">
            {premios.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-100">{p.producto?.nombre ?? '—'}</span>
                    {fuenteBadge(p)}
                    {turnoBadge(p.caja?.turno)}
                  </div>
                  {p.numero_ticket && (
                    <p className="text-xs text-gray-400">Ticket <span className="font-semibold text-gray-200">{p.numero_ticket}</span></p>
                  )}
                  {p.observaciones && (
                    <p className="text-xs text-gray-500">{p.observaciones}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {new Date(p.created_at).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-bold text-sm ${p.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {p.moneda === 'USD' ? `$${p.monto.toFixed(2)}` : formatVES(p.monto)}
                  </span>
                  {puedeEditar(p) && (
                    <div className="flex gap-1">
                      <button onClick={() => abrirEdicion(p)}
                        className="text-xs text-gray-500 hover:text-gray-200 transition-colors border border-gray-600 hover:border-gray-400 px-2 py-0.5 rounded">
                        Editar
                      </button>
                      <button onClick={() => setEliminando(p)}
                        className="text-xs text-red-600 hover:text-red-400 transition-colors border border-red-900 hover:border-red-700 px-2 py-0.5 rounded">
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal registrar premio */}
      {modalPremio && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-100">Registrar Premio</h2>
              <button onClick={() => { setModalPremio(false); setErrorModal(null) }} className="text-gray-500 hover:text-gray-200 transition-colors text-xl leading-none">✕</button>
            </div>

            {errorModal && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                <span>{errorModal}</span>
                <button onClick={() => setErrorModal(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-1">Sistema de lotería</label>
              <select value={premioProductoId} onChange={e => setPremioProductoId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">— Seleccionar —</option>
                {filas.map(f => (
                  <option key={f.producto_id} value={f.producto_id}>{f.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">N° de ticket premiado <span className="text-red-400">*</span></label>
              <input value={premioTicket} onChange={e => setPremioTicket(e.target.value)} placeholder="Ej. 1234"
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Moneda</label>
                <select value={premioMoneda} onChange={e => setPremioMoneda(e.target.value as 'USD' | 'VES')}
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="VES">Bs. (VES)</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Monto</label>
                <input type="number" step="0.01" min="0" value={premioMonto} onChange={e => setPremioMonto(e.target.value)} placeholder="0.00"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-2">Fuente de pago</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPremioFuente('caja')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${premioFuente === 'caja' ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  Efectivo de caja
                </button>
                <button onClick={() => setPremioFuente('externo')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${premioFuente === 'externo' ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  Fondo externo
                </button>
              </div>
              {premioFuente === 'externo' && (
                <select value={premioMetodoExterno} onChange={e => setPremioMetodoExterno(e.target.value as 'efectivo' | 'pago_movil')}
                  className="mt-2 w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="pago_movil">Pago Móvil</option>
                </select>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Observaciones</label>
              <input value={premioObs} onChange={e => setPremioObs(e.target.value)} placeholder="Opcional..."
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => { setModalPremio(false); setErrorModal(null) }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                Cancelar
              </button>
              <button onClick={registrarPremio}
                disabled={guardando || !cajaId || !premioProductoId || !premioTicket.trim() || !premioMonto || parseFloat(premioMonto) <= 0}
                className="bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors">
                {guardando ? 'Registrando...' : 'Registrar premio'}
              </button>
            </div>
            {!cajaId && (
              <p className="text-xs text-yellow-400 text-center">No hay caja activa en este turno</p>
            )}
          </div>
        </div>
      )}

      {/* Modal editar premio */}
      {editando && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-100">Editar Premio</h2>
              <button onClick={() => setEditando(null)} className="text-gray-500 hover:text-gray-200 transition-colors text-xl leading-none">✕</button>
            </div>

            {errorEdit && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                <span>{errorEdit}</span>
                <button onClick={() => setErrorEdit(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-1">Sistema de lotería</label>
              <select value={editProductoId} onChange={e => setEditProductoId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">— Sin especificar —</option>
                {filas.map(f => (
                  <option key={f.producto_id} value={f.producto_id}>{f.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">N° de ticket premiado <span className="text-red-400">*</span></label>
              <input value={editTicket} onChange={e => setEditTicket(e.target.value)} placeholder="Ej. 1234"
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Moneda</label>
                <select value={editMoneda} onChange={e => setEditMoneda(e.target.value as 'USD' | 'VES')}
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="VES">Bs. (VES)</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Monto</label>
                <input type="number" step="0.01" min="0" value={editMonto} onChange={e => setEditMonto(e.target.value)} placeholder="0.00"
                  className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-2">Fuente de pago</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEditFuente('caja')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${editFuente === 'caja' ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  Efectivo de caja
                </button>
                <button onClick={() => setEditFuente('externo')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${editFuente === 'externo' ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  Fondo externo
                </button>
              </div>
              {editFuente === 'externo' && (
                <select value={editMetodo} onChange={e => setEditMetodo(e.target.value as 'efectivo' | 'pago_movil')}
                  className="mt-2 w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="pago_movil">Pago Móvil</option>
                </select>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Observaciones</label>
              <input value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Opcional..."
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setEditando(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
                Cancelar
              </button>
              <button onClick={guardarEdicion}
                disabled={editGuardando || !editTicket.trim() || !editMonto || parseFloat(editMonto) <= 0}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {editGuardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación de premio */}
      {eliminando && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-red-400 text-base">Eliminar premio</h3>
            <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1">
              <p className="text-gray-300 font-medium">{eliminando.producto?.nombre ?? '— Sin sistema —'}</p>
              {eliminando.numero_ticket && (
                <p className="text-gray-400">Ticket #{eliminando.numero_ticket}</p>
              )}
              <p className={`font-bold ${eliminando.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                {eliminando.moneda === 'USD' ? `$ ${eliminando.monto.toFixed(2)}` : `Bs. ${eliminando.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-gray-500">
                {new Date(eliminando.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <p className="text-sm text-gray-400">
              Esta acción eliminará el premio permanentemente. El monto dejará de afectar el resumen del período.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmarEliminar}
                disabled={eliminandoGuardando}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
              >
                {eliminandoGuardando ? 'Eliminando…' : 'Confirmar eliminación'}
              </button>
              <button
                onClick={() => setEliminando(null)}
                disabled={eliminandoGuardando}
                className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
