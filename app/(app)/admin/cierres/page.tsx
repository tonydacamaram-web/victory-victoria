'use client'

import { useState, useEffect } from 'react'
import { formatUSD, formatVES } from '@/lib/utils/currency'

const METODOS_CONFIG: Record<string, { label: string; icono: string; moneda: 'USD' | 'VES' }> = {
  efectivo_usd:          { label: 'Efectivo USD',       icono: '💵', moneda: 'USD' },
  efectivo_ves:          { label: 'Efectivo Bs.',        icono: '💴', moneda: 'VES' },
  pago_movil:            { label: 'Pago Móvil',          icono: '📱', moneda: 'VES' },
  transferencia_ves:     { label: 'Transferencia Bs.',   icono: '🏦', moneda: 'VES' },
  banesco_pos:           { label: 'POS Banesco',         icono: '💳', moneda: 'VES' },
  biopago:               { label: 'Biopago',             icono: '👁️', moneda: 'VES' },
  zelle:                 { label: 'Zelle',               icono: '💜', moneda: 'USD' },
  binance:               { label: 'Binance',             icono: '🟡', moneda: 'USD' },
  billetera_digital_usd: { label: 'Billetera Digital',   icono: '👛', moneda: 'USD' },
}

interface SistemaDetalle {
  sistema_id: string
  sistema_nombre: string
  categoria_nombre: string
  count: number
  total_usd: number
  total_ves: number
}

interface PagoMetodo {
  metodo: string
  moneda: string
  total: number
  count: number
}

interface DetalleCorte {
  sistemas: SistemaDetalle[]
  tasa: number
  pagos_por_metodo: PagoMetodo[]
}

interface Corte {
  id: string
  tipo: 'parcial' | 'final'
  total_sistema_usd: number
  total_sistema_ves: number
  efectivo_contado_usd: number | null
  efectivo_contado_ves: number | null
  diferencia_usd: number
  diferencia_ves: number
  comision_total_usd: number
  contado_por_metodo: Record<string, number> | null
  observaciones: string | null
  created_at: string
  caja: {
    nombre: string
    turno_inicio: string | null
    turno_fin: string | null
    saldo_apertura_usd: number
    saldo_apertura_ves: number
  } | null
  usuario: { nombre: string } | null
}

export default function CierresPage() {
  const [cortes, setCortes] = useState<Corte[]>([])
  const [cargando, setCargando] = useState(false)
  const [desde, setDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0])
  const [expandido, setExpandido] = useState<string | null>(null)
  const [detalles, setDetalles] = useState<Record<string, DetalleCorte>>({})
  const [cargandoDetalle, setCargandoDetalle] = useState<Set<string>>(new Set())

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const params = new URLSearchParams({ desde: desde + 'T00:00:00', hasta: hasta + 'T23:59:59' })
    const res = await fetch(`/api/cortes?${params}`)
    if (res.ok) setCortes(await res.json())
    setCargando(false)
  }

  const soloCierres = cortes.filter(c => c.tipo === 'final')
  const totalComisiones = soloCierres.reduce((s, c) => s + c.comision_total_usd, 0)

  async function toggleExpandido(id: string) {
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    if (detalles[id]) return  // ya cargado
    setCargandoDetalle(prev => new Set(prev).add(id))
    const res = await fetch(`/api/cortes/${id}`)
    if (res.ok) {
      const data: DetalleCorte = await res.json()
      setDetalles(prev => ({ ...prev, [id]: data }))
    }
    setCargandoDetalle(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  function duracionTurno(c: Corte) {
    if (!c.caja?.turno_inicio || !c.caja?.turno_fin) return '—'
    const inicio = new Date(c.caja.turno_inicio)
    const fin = new Date(c.caja.turno_fin)
    const mins = Math.round((fin.getTime() - inicio.getTime()) / 60000)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const inputCls = "bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-amber-400">Historial de cierres</h1>

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-300 block mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />
        </div>
        <button onClick={cargar} disabled={cargando}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {cargando ? 'Cargando...' : 'Buscar'}
        </button>
      </div>

      {/* Resumen rápido */}
      {soloCierres.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Turnos cerrados</p>
            <p className="text-2xl font-bold text-gray-100">{soloCierres.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Ventas USD (sistema)</p>
            <p className="text-xl font-bold text-emerald-400">
              {formatUSD(soloCierres.reduce((s, c) => s + c.total_sistema_usd, 0))}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Comisiones cobradas</p>
            <p className="text-xl font-bold text-amber-400">{formatUSD(totalComisiones)}</p>
          </div>
        </div>
      )}

      {/* Lista de cortes */}
      <div className="space-y-3">
        {cortes.length === 0 && !cargando && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-500 text-sm">
            Sin cortes en este período
          </div>
        )}

        {cortes.map(corte => (
          <div key={corte.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            {/* Encabezado del corte */}
            <button
              onClick={() => toggleExpandido(corte.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  corte.tipo === 'final'
                    ? 'bg-red-900/50 text-red-400'
                    : 'bg-blue-900/50 text-blue-400'
                }`}>
                  {corte.tipo === 'final' ? 'Cierre final' : 'Corte parcial'}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-100">
                    {new Date(corte.created_at).toLocaleString('es-VE')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {corte.usuario?.nombre ?? '—'} · {corte.caja?.nombre ?? '—'}
                    {corte.tipo === 'final' && ` · Duración: ${duracionTurno(corte)}`}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-4 space-y-0.5">
                <p className="text-sm font-bold text-emerald-400">{formatUSD(corte.total_sistema_usd)}</p>
                <p className="text-xs text-blue-400">{formatVES(corte.total_sistema_ves)}</p>
              </div>
            </button>

            {/* Detalle expandible */}
            {expandido === corte.id && (
              <div className="border-t border-gray-700 px-4 py-4 space-y-4 bg-gray-800/50">

                {/* Saldos apertura/cierre + tasa */}
                {corte.caja && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Turno</p>
                      {detalles[corte.id]?.tasa > 0 && (
                        <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700 px-2 py-0.5 rounded-full font-semibold">
                          Tasa del día: {detalles[corte.id].tasa.toLocaleString('es-VE', { maximumFractionDigits: 2 })} Bs./$
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Apertura</p>
                        <p className="font-medium text-gray-100">{corte.caja.turno_inicio ? new Date(corte.caja.turno_inicio).toLocaleString('es-VE') : '—'}</p>
                        <p className="text-xs text-emerald-400 mt-1">Fondo USD: {formatUSD(corte.caja.saldo_apertura_usd)}</p>
                        <p className="text-xs text-blue-400">Fondo Bs.: {formatVES(corte.caja.saldo_apertura_ves)}</p>
                      </div>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Cierre</p>
                        <p className="font-medium text-gray-100">{corte.caja.turno_fin ? new Date(corte.caja.turno_fin).toLocaleString('es-VE') : '—'}</p>
                        <p className="text-xs text-gray-500 mt-1">Duración: {duracionTurno(corte)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Arqueo */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Arqueo</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1.5">Concepto</th>
                        <th className="text-right py-1.5">Sistema</th>
                        <th className="text-right py-1.5">Contado</th>
                        <th className="text-right py-1.5">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      <tr>
                        <td className="py-2 font-medium text-gray-100">USD</td>
                        <td className="py-2 text-right">
                          <p className="text-emerald-400 font-medium">{formatUSD(corte.total_sistema_usd)}</p>
                          {detalles[corte.id]?.tasa > 0 && (
                            <p className="text-xs text-gray-500">{formatVES(corte.total_sistema_usd * detalles[corte.id].tasa)}</p>
                          )}
                        </td>
                        <td className="py-2 text-right text-gray-300">
                          {corte.efectivo_contado_usd != null ? formatUSD(corte.efectivo_contado_usd) : '—'}
                        </td>
                        <td className={`py-2 text-right font-semibold ${corte.diferencia_usd < 0 ? 'text-red-400' : corte.diferencia_usd > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                          {corte.efectivo_contado_usd != null
                            ? (corte.diferencia_usd >= 0 ? '+' : '') + formatUSD(corte.diferencia_usd)
                            : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 font-medium text-gray-100">Bolívares</td>
                        <td className="py-2 text-right text-blue-400 font-medium">{formatVES(corte.total_sistema_ves)}</td>
                        <td className="py-2 text-right text-gray-300">
                          {corte.efectivo_contado_ves != null ? formatVES(corte.efectivo_contado_ves) : '—'}
                        </td>
                        <td className={`py-2 text-right font-semibold ${corte.diferencia_ves < 0 ? 'text-red-400' : corte.diferencia_ves > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                          {corte.efectivo_contado_ves != null
                            ? (corte.diferencia_ves >= 0 ? '+' : '') + formatVES(corte.diferencia_ves)
                            : '—'}
                        </td>
                      </tr>
                      <tr className="bg-amber-900/20">
                        <td className="py-2 font-medium text-amber-400">Comisiones</td>
                        <td className="py-2 text-right text-amber-400 font-bold" colSpan={3}>
                          {formatUSD(corte.comision_total_usd)}
                          {detalles[corte.id]?.tasa > 0 && (
                            <span className="text-xs text-gray-500 ml-2">
                              ≈ {formatVES(corte.comision_total_usd * detalles[corte.id].tasa)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Desglose por método de pago */}
                {detalles[corte.id]?.pagos_por_metodo?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Métodos de pago</p>
                    <div className="border border-gray-700 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-800 border-b border-gray-700 text-gray-400">
                            <th className="text-left px-3 py-2">Método</th>
                            <th className="text-right px-3 py-2">Sistema</th>
                            <th className="text-right px-3 py-2">Contado</th>
                            <th className="text-right px-3 py-2">Dif.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {(['USD', 'VES'] as const).map(moneda => {
                            const filas = detalles[corte.id].pagos_por_metodo
                              .filter(p => (METODOS_CONFIG[p.metodo]?.moneda ?? p.moneda) === moneda)
                            if (!filas.length) return null
                            const subtotalSistema = filas.reduce((s, p) => s + p.total, 0)
                            const contadoMap = corte.contado_por_metodo ?? {}
                            const subtotalContado = filas.reduce((s, p) => s + (contadoMap[p.metodo] ?? 0), 0)
                            const subtotalDif = subtotalContado - subtotalSistema
                            const fmt = moneda === 'USD' ? formatUSD : formatVES
                            return (
                              <>
                                {filas.map(p => {
                                  const cfg = METODOS_CONFIG[p.metodo]
                                  const contado = contadoMap[p.metodo] ?? null
                                  const dif = contado !== null ? contado - p.total : null
                                  return (
                                    <tr key={p.metodo} className="bg-gray-800/60">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          <span>{cfg?.icono ?? '•'}</span>
                                          <span className="text-gray-200">{cfg?.label ?? p.metodo}</span>
                                          <span className="text-gray-500 bg-gray-700 px-1 rounded-full">{p.count} op.</span>
                                        </div>
                                      </td>
                                      <td className={`px-3 py-2 text-right font-semibold ${moneda === 'USD' ? 'text-emerald-400' : 'text-blue-300'}`}>
                                        {fmt(p.total)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-300">
                                        {contado !== null ? fmt(contado) : <span className="text-gray-600">—</span>}
                                      </td>
                                      <td className={`px-3 py-2 text-right font-semibold ${
                                        dif === null ? 'text-gray-600' : dif < 0 ? 'text-red-400' : dif > 0 ? 'text-blue-400' : 'text-gray-500'
                                      }`}>
                                        {dif === null ? '—' : (dif >= 0 ? '+' : '') + fmt(dif)}
                                      </td>
                                    </tr>
                                  )
                                })}
                                <tr className="bg-gray-700/40 font-semibold">
                                  <td className="px-3 py-2 text-gray-400">
                                    Subtotal {moneda === 'USD' ? 'divisas' : 'Bs.'}
                                  </td>
                                  <td className={`px-3 py-2 text-right ${moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                    {fmt(subtotalSistema)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-300">
                                    {subtotalContado > 0 ? fmt(subtotalContado) : '—'}
                                  </td>
                                  <td className={`px-3 py-2 text-right ${
                                    subtotalContado === 0 ? 'text-gray-600' : subtotalDif < 0 ? 'text-red-400' : subtotalDif > 0 ? 'text-blue-400' : 'text-gray-500'
                                  }`}>
                                    {subtotalContado > 0 ? ((subtotalDif >= 0 ? '+' : '') + fmt(subtotalDif)) : '—'}
                                  </td>
                                </tr>
                              </>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Desglose por sistema de inventario */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ventas por sistema de inventario</p>
                  {cargandoDetalle.has(corte.id) && (
                    <p className="text-xs text-gray-500 py-2">Cargando...</p>
                  )}
                  {detalles[corte.id] && detalles[corte.id].sistemas.length === 0 && (
                    <p className="text-xs text-gray-500 py-2">Sin datos de sistemas para este cierre</p>
                  )}
                  {detalles[corte.id] && detalles[corte.id].sistemas.length > 0 && (() => {
                    const items = detalles[corte.id].sistemas
                    const categorias = [...new Set(items.map(i => i.categoria_nombre))]
                    return (
                      <div className="space-y-3">
                        {categorias.map(cat => {
                          const sistemas = items.filter(i => i.categoria_nombre === cat)
                          const catTotal = sistemas.reduce((s, i) => s + i.total_usd, 0)
                          return (
                            <div key={cat}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{cat}</span>
                                <span className="text-xs font-bold text-gray-300">{formatUSD(catTotal)}</span>
                              </div>
                              <div className="divide-y divide-gray-700 border border-gray-700 rounded-lg overflow-hidden">
                                {sistemas.map(s => (
                                  <div key={s.sistema_id} className="flex items-center justify-between px-3 py-2 bg-gray-800/60">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-200">{s.sistema_nombre}</span>
                                      <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded-full">{s.count} op.</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold text-emerald-400">{formatUSD(s.total_usd)}</p>
                                      {s.total_ves > 0 && <p className="text-xs text-blue-400">{formatVES(s.total_ves)}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        <div className="flex justify-between items-center border-t border-gray-600 pt-2">
                          <span className="text-xs font-semibold text-gray-300">Total sistemas</span>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-400">{formatUSD(items.reduce((s, i) => s + i.total_usd, 0))}</p>
                            <p className="text-xs text-blue-400">{formatVES(items.reduce((s, i) => s + i.total_ves, 0))}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {corte.observaciones && (
                  <div className="bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-300">
                    <span className="font-semibold">Observaciones:</span> {corte.observaciones}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
