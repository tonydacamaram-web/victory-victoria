'use client'

import { useState, useEffect, useMemo } from 'react'
import { Transaccion, MetodoPago } from '@/types'
import { formatUSD, formatVES } from '@/lib/utils/currency'
import { PaymentTooltip } from '@/components/shared/PaymentTooltip'

const METODO_LABELS: Record<MetodoPago, string> = {
  efectivo_usd: 'Efectivo USD',
  efectivo_ves: 'Efectivo Bs.',
  pago_movil: 'Pago Móvil',
  transferencia_ves: 'Transferencia',
  banesco_pos: 'POS Banesco',
  biopago: 'Biopago',
  zelle: 'Zelle',
  binance: 'Binance',
  billetera_digital_usd: 'Billetera Digital',
  vale: 'Vale',
}

const TODOS_METODOS: MetodoPago[] = [
  'efectivo_usd', 'efectivo_ves', 'pago_movil', 'transferencia_ves',
  'banesco_pos', 'biopago', 'zelle', 'binance', 'billetera_digital_usd', 'vale',
]

interface ItemDetalle {
  nombre_producto: string
  monto_libre_usd: number | null
  producto?: {
    nombre: string
    categoria?: { nombre: string } | null
    sistema?: { nombre: string } | null
  } | null
}

interface TransaccionConCaja extends Omit<Transaccion, 'items'> {
  caja: {
    nombre: string
    turno_inicio: string | null
    turno_fin: string | null
    usuario: { nombre: string } | null
  } | null
  items?: ItemDetalle[]
}

interface GrupoTurno {
  caja_id: string
  nombre_turno: string
  cajero: string
  turno_inicio: string | null
  turno_fin: string | null
  transacciones: TransaccionConCaja[]
}

const TZ = 'America/Caracas'

function horaVET(iso: string): number {
  return parseInt(new Date(iso).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }))
}

function fechaHoyVET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

function nombreTurno(cajaId: string, turnoInicio: string | null, cajaNombre: string): string {
  if (!turnoInicio) return cajaNombre || `Turno ${cajaId.slice(0, 6)}`
  const hora = horaVET(turnoInicio)
  const periodo = hora < 12 ? 'Mañana' : 'Tarde'
  const dia = new Date(turnoInicio).toLocaleDateString('es-VE', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
  })
  return `Turno ${periodo} · ${dia.charAt(0).toUpperCase() + dia.slice(1)}`
}

export default function ReportesPage() {
  const [transacciones, setTransacciones] = useState<TransaccionConCaja[]>([])
  const [cargando, setCargando] = useState(false)
  const [desde, setDesde] = useState(() => fechaHoyVET())
  const [hasta, setHasta] = useState(() => fechaHoyVET())
  const [turnosExpandidos, setTurnosExpandidos] = useState<Set<string>>(new Set())
  const [modoGestion, setModoGestion] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [filtroMetodo, setFiltroMetodo] = useState<MetodoPago | ''>('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const params = new URLSearchParams({ desde: desde + 'T00:00:00-04:00', hasta: hasta + 'T23:59:59-04:00' })
    const res = await fetch(`/api/transacciones?${params}`)
    if (res.ok) {
      const data = await res.json()
      setTransacciones(data)
      const ids = new Set<string>(data.map((t: TransaccionConCaja) => t.caja_id))
      setTurnosExpandidos(ids)
    }
    setCargando(false)
  }

  function toggleTurno(id: string) {
    setTurnosExpandidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Categorías únicas presentes en las transacciones cargadas
  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const t of transacciones) {
      for (const item of t.items ?? []) {
        const cat = item.producto?.categoria?.nombre
        if (cat) set.add(cat)
      }
    }
    return Array.from(set).sort()
  }, [transacciones])

  // Aplicar filtros de método y categoría
  const transaccionesFiltradas = useMemo(() => {
    return transacciones.filter(t => {
      if (filtroMetodo && !t.metodo_pago.includes(filtroMetodo)) return false
      if (filtroCategoria && !(t.items ?? []).some(i => i.producto?.categoria?.nombre === filtroCategoria)) return false
      return true
    })
  }, [transacciones, filtroMetodo, filtroCategoria])

  // Agrupar transacciones por turno (caja_id)
  const grupos: GrupoTurno[] = []
  const vistoCajaId = new Map<string, GrupoTurno>()
  for (const t of transaccionesFiltradas) {
    const cid = t.caja_id
    if (!vistoCajaId.has(cid)) {
      const grupo: GrupoTurno = {
        caja_id: cid,
        nombre_turno: nombreTurno(cid, t.caja?.turno_inicio ?? null, t.caja?.nombre ?? ''),
        cajero: t.caja?.usuario?.nombre ?? '—',
        turno_inicio: t.caja?.turno_inicio ?? null,
        turno_fin: t.caja?.turno_fin ?? null,
        transacciones: [],
      }
      vistoCajaId.set(cid, grupo)
      grupos.push(grupo)
    }
    vistoCajaId.get(cid)!.transacciones.push(t)
  }

  // Totales globales — excluye anuladas, aplica filtros activos
  const activas = transaccionesFiltradas.filter(t => !t.anulada)
  const totalUsd = activas.reduce((s, t) => s + t.total_usd, 0)
  const totalVes = activas.reduce((s, t) => s + t.total_ves, 0)
  const totalComisiones = activas.reduce((s, t) => s + t.comision_total_usd, 0)

  async function anularVenta(id: string) {
    if (!confirm('¿Anular esta transacción? Esta acción no se puede deshacer.')) return
    setErrorMsg(null)
    const res = await fetch(`/api/transacciones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anulada: true }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setErrorMsg(`Error al anular: ${body.error ?? res.statusText}`)
      return
    }
    await cargar()
  }

  function exportarCSV() {
    const filas = [
      ['Turno', 'Cajero', 'Fecha', 'Productos', 'Categorías', 'Sistemas', 'Método', 'Total USD', 'Total Bs.', 'Comisión', 'Anulada'],
      ...transacciones.map(t => [
        grupos.find(g => g.caja_id === t.caja_id)?.nombre_turno ?? '',
        t.caja?.usuario?.nombre ?? '',
        new Date(t.created_at).toLocaleString('es-VE'),
        (t.items ?? []).map(i => i.nombre_producto).join(' / '),
        (t.items ?? []).map(i => i.producto?.categoria?.nombre ?? '').filter(Boolean).join(' / '),
        (t.items ?? []).map(i => i.producto?.sistema?.nombre ?? '').filter(Boolean).join(' / '),
        t.metodo_pago.join('+'),
        t.total_usd.toFixed(2),
        t.total_ves.toFixed(2),
        t.comision_total_usd.toFixed(2),
        t.anulada ? 'Sí' : 'No',
      ])
    ]
    const csv = filas.map(f => f.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${desde}_${hasta}.csv`
    a.click()
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">Reportes</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setModoGestion(v => !v)}
            className={`border px-4 py-2 rounded-lg text-sm transition-colors ${
              modoGestion
                ? 'border-red-500 text-red-400 bg-red-900/20 hover:bg-red-900/30'
                : 'border-gray-600 text-gray-300 hover:bg-gray-800'
            }`}>
            {modoGestion ? 'Salir gestión' : 'Gestionar ventas'}
          </button>
          <button onClick={exportarCSV} disabled={!transacciones.length}
            className="border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-40 transition-colors">
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-4 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <button onClick={cargar} disabled={cargando}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {cargando ? 'Cargando...' : 'Buscar'}
        </button>
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Método de pago</label>
          <select
            value={filtroMetodo}
            onChange={e => setFiltroMetodo(e.target.value as MetodoPago | '')}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos los métodos</option>
            {TODOS_METODOS.map(m => (
              <option key={m} value={m}>{METODO_LABELS[m]}</option>
            ))}
          </select>
        </div>
        {categoriasDisponibles.length > 0 && (
          <div>
            <label className="text-xs font-medium text-gray-300 block mb-1">Categoría</label>
            <select
              value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Todas las categorías</option>
              {categoriasDisponibles.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}
        {(filtroMetodo || filtroCategoria) && (
          <button
            onClick={() => { setFiltroMetodo(''); setFiltroCategoria('') }}
            className="border border-gray-600 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 transition-colors self-end"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resumen global */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Transacciones</p>
          <p className="text-2xl font-bold text-gray-100">{activas.length}</p>
          {transaccionesFiltradas.length !== activas.length && (
            <p className="text-xs text-red-400">{transaccionesFiltradas.length - activas.length} anulada{transaccionesFiltradas.length - activas.length > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Total USD</p>
          <p className="text-xl font-bold text-emerald-400">{formatUSD(totalUsd)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Total Bs.</p>
          <p className="text-xl font-bold text-blue-400">{formatVES(totalVes)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Comisiones</p>
          <p className="text-xl font-bold text-amber-400">{formatUSD(totalComisiones)}</p>
        </div>
      </div>

      {/* Turnos */}
      {transacciones.length === 0 && !cargando && (
        <div className="bg-white border rounded-xl p-8 text-center text-gray-400 text-sm">
          Sin transacciones en este período
        </div>
      )}

      <div className="space-y-4">
        {grupos.map(grupo => {
          const gactivas = grupo.transacciones.filter(t => !t.anulada)
          const gtotalUsd = gactivas.reduce((s, t) => s + t.total_usd, 0)
          const gtotalVes = gactivas.reduce((s, t) => s + t.total_ves, 0)
          const gcomision = gactivas.reduce((s, t) => s + t.comision_total_usd, 0)
          const expandido = turnosExpandidos.has(grupo.caja_id)

          return (
            <div key={grupo.caja_id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleTurno(grupo.caja_id)}
                className="w-full px-4 py-3 flex items-start justify-between hover:bg-gray-800 transition-colors text-left"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-gray-100">{grupo.nombre_turno}</p>
                  <p className="text-xs text-gray-400">
                    {grupo.cajero}
                    {grupo.turno_inicio && (
                      <> · {new Date(grupo.turno_inicio).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
                      {grupo.turno_fin && <> – {new Date(grupo.turno_fin).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}</>}
                      </>
                    )}
                    <> · {grupo.transacciones.length} transacciones</>
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-bold text-emerald-400">{formatUSD(gtotalUsd)}</p>
                  <p className="text-xs text-blue-400">{formatVES(gtotalVes)}</p>
                  {gcomision > 0 && (
                    <p className="text-xs text-amber-400">com. {formatUSD(gcomision)}</p>
                  )}
                </div>
              </button>

              {expandido && (
                <div className="border-t border-gray-700 overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-gray-800 border-b border-gray-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-400 text-xs">Hora</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-400 text-xs">Productos</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-400 text-xs">Método</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">USD</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Bs.</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Comisión</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-400 text-xs">Estado</th>
                        {modoGestion && <th className="text-center px-3 py-2 font-medium text-gray-400 text-xs">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {grupo.transacciones.map(t => (
                        <tr key={t.id} className={`hover:bg-gray-800 ${t.anulada ? 'opacity-40 line-through' : ''}`}>
                          <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                            {new Date(t.created_at).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 max-w-xs">
                            <div className="space-y-1">
                              {(t.items ?? []).map((item, i) => (
                                <div key={i} className="flex flex-col gap-0.5">
                                  <span className="text-xs text-gray-100 font-medium leading-tight">{item.nombre_producto}</span>
                                  <div className="flex flex-wrap gap-1">
                                    {item.producto?.categoria?.nombre && (
                                      <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                                        {item.producto.categoria.nombre}
                                      </span>
                                    )}
                                    {item.producto?.sistema?.nombre && (
                                      <span className="text-xs bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded">
                                        {item.producto.sistema.nombre}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {t.metodo_pago.map(m => (
                                <PaymentTooltip
                                  key={m}
                                  metodo={m as MetodoPago}
                                  pago={t.pagos?.find(p => p.metodo === m)}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-400 whitespace-nowrap">
                            {t.total_usd > 0 ? formatUSD(t.total_usd) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-blue-400 whitespace-nowrap">
                            {t.total_ves > 0 ? formatVES(t.total_ves) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-400 whitespace-nowrap">
                            {t.comision_total_usd > 0 ? formatUSD(t.comision_total_usd) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {t.anulada
                              ? <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">Anulada</span>
                              : <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">OK</span>
                            }
                          </td>
                          {modoGestion && (
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              {!t.anulada && (
                                <button onClick={() => anularVenta(t.id)}
                                  className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded hover:bg-red-900/70 transition-colors">
                                  Anular
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-800 border-t border-gray-700">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-300">Subtotal turno</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-emerald-400">{formatUSD(gtotalUsd)}</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-blue-400">{formatVES(gtotalVes)}</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-amber-400">{formatUSD(gcomision)}</td>
                        <td colSpan={modoGestion ? 2 : 1} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
