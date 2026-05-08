'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatUSD, formatVES, usdToVes } from '@/lib/utils/currency'

type Periodo = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_ant' | 'personalizado'

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy',       label: 'Hoy' },
  { key: 'ayer',      label: 'Ayer' },
  { key: 'semana',    label: 'Esta semana' },
  { key: 'mes',       label: 'Este mes' },
  { key: 'mes_ant',   label: 'Mes anterior' },
  { key: 'personalizado', label: 'Personalizado' },
]

const METODO_INFO: Record<string, { label: string; esDivisas: boolean }> = {
  efectivo_usd:       { label: 'Efectivo USD',      esDivisas: true  },
  zelle:              { label: 'Zelle',              esDivisas: true  },
  binance:            { label: 'Binance',            esDivisas: true  },
  billetera_digital_usd: { label: 'Billetera Digital', esDivisas: true },
  vale:               { label: 'Vale',               esDivisas: true  },
  efectivo_ves:       { label: 'Efectivo Bs.',       esDivisas: false },
  pago_movil:         { label: 'Pago Móvil',         esDivisas: false },
  transferencia_ves:  { label: 'Transferencia Bs.',  esDivisas: false },
  banesco_pos:        { label: 'Banesco POS',        esDivisas: false },
  biopago:            { label: 'Biopago',            esDivisas: false },
}

function pad(n: number) { return n.toString().padStart(2, '0') }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function getRango(periodo: Periodo, desde: string, hasta: string) {
  const hoy = new Date()
  switch (periodo) {
    case 'hoy':     return { desde: fmt(hoy), hasta: fmt(hoy) }
    case 'ayer': { const a = new Date(hoy); a.setDate(hoy.getDate() - 1); return { desde: fmt(a), hasta: fmt(a) } }
    case 'semana': {
      const l = new Date(hoy); l.setDate(hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1))
      return { desde: fmt(l), hasta: fmt(hoy) }
    }
    case 'mes': {
      return { desde: fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fmt(hoy) }
    }
    case 'mes_ant': {
      return {
        desde: fmt(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      }
    }
    default: return { desde, hasta }
  }
}

interface DashData {
  totales: { total_usd: number; comision_usd: number; num_transacciones: number; tasa_promedio: number }
  por_metodo: { metodo: string; total_usd: number; total_ves: number; num_ops: number; comision_usd: number }[]
  por_categoria: { categoria: string; total_usd: number; comision_usd: number; num_ventas: number }[]
  por_producto: { producto: string; categoria: string; total_usd: number; comision_usd: number; num_ventas: number }[]
}

export default function ComisionesPage() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desdeInput, setDesdeInput] = useState('')
  const [hastaInput, setHastaInput] = useState('')
  const [data, setData] = useState<DashData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [mostrarTodosProductos, setMostrarTodosProductos] = useState(false)

  const cargar = useCallback(async () => {
    const { desde, hasta } = getRango(periodo, desdeInput, hastaInput)
    if (!desde || !hasta) return
    setCargando(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/comisiones?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Error'); }
      setData(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }, [periodo, desdeInput, hastaInput])

  useEffect(() => { cargar() }, [cargar])

  const tasa = data?.totales.tasa_promedio ?? 0
  const { desde: rangoDesde, hasta: rangoHasta } = getRango(periodo, desdeInput, hastaInput)

  const divisas = data?.por_metodo.filter(m => METODO_INFO[m.metodo]?.esDivisas) ?? []
  const bolivares = data?.por_metodo.filter(m => !METODO_INFO[m.metodo]?.esDivisas) ?? []

  const totalMetodoUsd = (m: DashData['por_metodo'][0]) =>
    m.total_usd + (tasa > 0 ? m.total_ves / tasa : 0)

  const productosVisibles = mostrarTodosProductos
    ? (data?.por_producto ?? [])
    : (data?.por_producto ?? []).slice(0, 15)

  const thCls = 'text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide'
  const tdCls = 'px-4 py-2.5 text-sm'

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* Header + selector de período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-amber-400">Comisiones e Ingresos</h1>
          {rangoDesde && rangoHasta && (
            <p className="text-xs text-gray-500 mt-0.5">
              {rangoDesde === rangoHasta ? rangoDesde : `${rangoDesde} → ${rangoHasta}`}
              {tasa > 0 && <span className="ml-2">· Tasa prom. {formatVES(tasa)}</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                periodo === p.key
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rango personalizado */}
      {periodo === 'personalizado' && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={desdeInput}
            onChange={e => setDesdeInput(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <span className="text-gray-500 text-sm">hasta</span>
          <input
            type="date"
            value={hastaInput}
            onChange={e => setHastaInput(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={cargar}
            className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            Consultar
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      {cargando && (
        <div className="text-center py-12 text-gray-500 text-sm">Cargando...</div>
      )}

      {!cargando && data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Ventas totales</p>
              <p className="text-xl font-bold text-gray-100">{formatUSD(data.totales.total_usd)}</p>
              {tasa > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatVES(usdToVes(data.totales.total_usd, tasa))}</p>}
            </div>
            <div className="bg-gray-900 border border-amber-800/50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Comisión total</p>
              <p className="text-xl font-bold text-amber-400">{formatUSD(data.totales.comision_usd)}</p>
              {tasa > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatVES(usdToVes(data.totales.comision_usd, tasa))}</p>}
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Margen</p>
              <p className="text-xl font-bold text-emerald-400">
                {data.totales.total_usd > 0
                  ? `${((data.totales.comision_usd / data.totales.total_usd) * 100).toFixed(2)}%`
                  : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">sobre ventas</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Transacciones</p>
              <p className="text-xl font-bold text-gray-100">{data.totales.num_transacciones}</p>
              {data.totales.num_transacciones > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  ~{formatUSD(data.totales.total_usd / data.totales.num_transacciones)} prom.
                </p>
              )}
            </div>
          </div>

          {/* Por método de pago */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="font-semibold text-gray-100 text-sm">Desglose por método de pago</h2>
            </div>

            {/* Divisas */}
            {divisas.length > 0 && (
              <>
                <div className="px-4 py-2 bg-indigo-950/40 border-b border-gray-700">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Divisas (USD)</span>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className={thCls}>Método</th>
                      <th className={`${thCls} text-right`}>Monto procesado</th>
                      <th className={`${thCls} text-right`}>Equiv. USD</th>
                      <th className={`${thCls} text-right`}>Comisión</th>
                      <th className={`${thCls} text-right`}>Operaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {divisas.map(m => (
                      <tr key={m.metodo} className="hover:bg-gray-800/40">
                        <td className={tdCls}>
                          <span className="font-medium text-gray-100">{METODO_INFO[m.metodo]?.label ?? m.metodo}</span>
                        </td>
                        <td className={`${tdCls} text-right text-gray-300`}>{formatUSD(m.total_usd)}</td>
                        <td className={`${tdCls} text-right text-gray-400`}>{formatUSD(totalMetodoUsd(m))}</td>
                        <td className={`${tdCls} text-right font-semibold ${m.comision_usd > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                          {m.comision_usd > 0 ? formatUSD(m.comision_usd) : '—'}
                        </td>
                        <td className={`${tdCls} text-right text-gray-400`}>{m.num_ops}</td>
                      </tr>
                    ))}
                    <tr className="bg-indigo-950/20 font-semibold">
                      <td className={`${tdCls} text-indigo-300`}>Subtotal divisas</td>
                      <td className={`${tdCls} text-right text-indigo-300`}>{formatUSD(divisas.reduce((s, m) => s + m.total_usd, 0))}</td>
                      <td className={`${tdCls} text-right text-indigo-300`}>{formatUSD(divisas.reduce((s, m) => s + totalMetodoUsd(m), 0))}</td>
                      <td className={`${tdCls} text-right text-amber-400`}>{formatUSD(divisas.reduce((s, m) => s + m.comision_usd, 0))}</td>
                      <td className={`${tdCls} text-right text-indigo-300`}>{divisas.reduce((s, m) => s + m.num_ops, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Bolívares */}
            {bolivares.length > 0 && (
              <>
                <div className="px-4 py-2 bg-emerald-950/30 border-t border-b border-gray-700">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Bolívares (VES)</span>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className={thCls}>Método</th>
                      <th className={`${thCls} text-right`}>Monto procesado (Bs.)</th>
                      <th className={`${thCls} text-right`}>Equiv. USD</th>
                      <th className={`${thCls} text-right`}>Comisión</th>
                      <th className={`${thCls} text-right`}>Operaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {bolivares.map(m => (
                      <tr key={m.metodo} className="hover:bg-gray-800/40">
                        <td className={tdCls}>
                          <span className="font-medium text-gray-100">{METODO_INFO[m.metodo]?.label ?? m.metodo}</span>
                        </td>
                        <td className={`${tdCls} text-right text-gray-300`}>{formatVES(m.total_ves)}</td>
                        <td className={`${tdCls} text-right text-gray-400`}>{tasa > 0 ? formatUSD(m.total_ves / tasa) : '—'}</td>
                        <td className={`${tdCls} text-right font-semibold ${m.comision_usd > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                          {m.comision_usd > 0 ? (
                            <>
                              {formatUSD(m.comision_usd)}
                              {tasa > 0 && <span className="block text-xs text-gray-500">{formatVES(usdToVes(m.comision_usd, tasa))}</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td className={`${tdCls} text-right text-gray-400`}>{m.num_ops}</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-950/20 font-semibold">
                      <td className={`${tdCls} text-emerald-300`}>Subtotal bolívares</td>
                      <td className={`${tdCls} text-right text-emerald-300`}>{formatVES(bolivares.reduce((s, m) => s + m.total_ves, 0))}</td>
                      <td className={`${tdCls} text-right text-emerald-300`}>{tasa > 0 ? formatUSD(bolivares.reduce((s, m) => s + m.total_ves / tasa, 0)) : '—'}</td>
                      <td className={`${tdCls} text-right text-amber-400`}>{formatUSD(bolivares.reduce((s, m) => s + m.comision_usd, 0))}</td>
                      <td className={`${tdCls} text-right text-emerald-300`}>{bolivares.reduce((s, m) => s + m.num_ops, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {data.por_metodo.length === 0 && (
              <p className="text-center py-8 text-gray-500 text-sm">Sin transacciones en el período</p>
            )}
          </div>

          {/* Por departamento */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="font-semibold text-gray-100 text-sm">Por departamento</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className={thCls}>Departamento</th>
                  <th className={`${thCls} text-right`}>Ventas (USD)</th>
                  {tasa > 0 && <th className={`${thCls} text-right`}>Ventas (Bs.)</th>}
                  <th className={`${thCls} text-right`}>Comisión (USD)</th>
                  {tasa > 0 && <th className={`${thCls} text-right`}>Comisión (Bs.)</th>}
                  <th className={`${thCls} text-right`}>Margen</th>
                  <th className={`${thCls} text-right`}>Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {data.por_categoria.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-gray-500 text-sm">Sin datos</td></tr>
                )}
                {data.por_categoria.map(c => (
                  <tr key={c.categoria} className="hover:bg-gray-800/40">
                    <td className={`${tdCls} font-medium text-amber-400`}>{c.categoria}</td>
                    <td className={`${tdCls} text-right text-gray-200`}>{formatUSD(c.total_usd)}</td>
                    {tasa > 0 && <td className={`${tdCls} text-right text-gray-500`}>{formatVES(usdToVes(c.total_usd, tasa))}</td>}
                    <td className={`${tdCls} text-right font-semibold text-amber-400`}>{formatUSD(c.comision_usd)}</td>
                    {tasa > 0 && <td className={`${tdCls} text-right text-gray-500`}>{formatVES(usdToVes(c.comision_usd, tasa))}</td>}
                    <td className={`${tdCls} text-right text-emerald-400`}>
                      {c.total_usd > 0 ? `${((c.comision_usd / c.total_usd) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className={`${tdCls} text-right text-gray-400`}>{c.num_ventas}</td>
                  </tr>
                ))}
              </tbody>
              {data.por_categoria.length > 0 && (
                <tfoot className="bg-gray-800 border-t border-gray-700">
                  <tr className="font-semibold">
                    <td className={`${tdCls} text-gray-300`}>Total</td>
                    <td className={`${tdCls} text-right text-gray-200`}>{formatUSD(data.totales.total_usd)}</td>
                    {tasa > 0 && <td className={`${tdCls} text-right text-gray-500`}>{formatVES(usdToVes(data.totales.total_usd, tasa))}</td>}
                    <td className={`${tdCls} text-right text-amber-400`}>{formatUSD(data.totales.comision_usd)}</td>
                    {tasa > 0 && <td className={`${tdCls} text-right text-gray-500`}>{formatVES(usdToVes(data.totales.comision_usd, tasa))}</td>}
                    <td className={`${tdCls} text-right text-emerald-400`}>
                      {data.totales.total_usd > 0
                        ? `${((data.totales.comision_usd / data.totales.total_usd) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className={`${tdCls} text-right text-gray-400`}>{data.por_categoria.reduce((s, c) => s + c.num_ventas, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Por producto */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-100 text-sm">Por producto</h2>
              <span className="text-xs text-gray-500">{data.por_producto.length} productos</span>
            </div>
            <table className="w-full">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className={thCls}>Producto</th>
                  <th className={thCls}>Departamento</th>
                  <th className={`${thCls} text-right`}>Ventas (USD)</th>
                  {tasa > 0 && <th className={`${thCls} text-right`}>Ventas (Bs.)</th>}
                  <th className={`${thCls} text-right`}>Comisión (USD)</th>
                  {tasa > 0 && <th className={`${thCls} text-right`}>Comisión (Bs.)</th>}
                  <th className={`${thCls} text-right`}>Margen</th>
                  <th className={`${thCls} text-right`}>Uds.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {productosVisibles.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-gray-500 text-sm">Sin datos</td></tr>
                )}
                {productosVisibles.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-800/40">
                    <td className={`${tdCls} font-medium text-gray-100`}>{p.producto}</td>
                    <td className={`${tdCls} text-xs text-amber-500`}>{p.categoria}</td>
                    <td className={`${tdCls} text-right text-gray-300`}>{formatUSD(p.total_usd)}</td>
                    {tasa > 0 && <td className={`${tdCls} text-right text-gray-500 text-xs`}>{formatVES(usdToVes(p.total_usd, tasa))}</td>}
                    <td className={`${tdCls} text-right font-semibold ${p.comision_usd > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                      {p.comision_usd > 0 ? formatUSD(p.comision_usd) : '—'}
                    </td>
                    {tasa > 0 && (
                      <td className={`${tdCls} text-right text-gray-500 text-xs`}>
                        {p.comision_usd > 0 ? formatVES(usdToVes(p.comision_usd, tasa)) : '—'}
                      </td>
                    )}
                    <td className={`${tdCls} text-right text-emerald-400`}>
                      {p.total_usd > 0 ? `${((p.comision_usd / p.total_usd) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className={`${tdCls} text-right text-gray-400`}>{p.num_ventas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.por_producto.length > 15 && (
              <div className="px-4 py-3 border-t border-gray-700 text-center">
                <button
                  onClick={() => setMostrarTodosProductos(v => !v)}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {mostrarTodosProductos
                    ? 'Ver menos'
                    : `Ver todos (${data.por_producto.length} productos)`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!cargando && !data && !error && (
        <div className="text-center py-12 text-gray-500 text-sm">Selecciona un período para consultar</div>
      )}
    </div>
  )
}
