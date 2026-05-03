'use client'

import { useState, useEffect, useCallback } from 'react'
import { Caja, Transaccion, MetodoPago, METODOS_DIVISAS, PremioBoleteria, TasaCambio } from '@/types'
import { formatUSD, formatVES } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'

const METODOS_CONFIG: Record<MetodoPago, { label: string; moneda: 'USD' | 'VES'; icono: string }> = {
  efectivo_usd:          { label: 'Efectivo USD',       moneda: 'USD', icono: '💵' },
  efectivo_ves:          { label: 'Efectivo Bs.',        moneda: 'VES', icono: '💴' },
  pago_movil:            { label: 'Pago Móvil',          moneda: 'VES', icono: '📱' },
  transferencia_ves:     { label: 'Transferencia Bs.',   moneda: 'VES', icono: '🏦' },
  banesco_pos:           { label: 'POS Banesco',         moneda: 'VES', icono: '💳' },
  biopago:               { label: 'Biopago',             moneda: 'VES', icono: '👁️' },
  zelle:                 { label: 'Zelle',               moneda: 'USD', icono: '💜' },
  binance:               { label: 'Binance',             moneda: 'USD', icono: '🟡' },
  billetera_digital_usd: { label: 'Billetera Digital',   moneda: 'USD', icono: '👛' },
  vale:                  { label: 'Vale',                moneda: 'USD', icono: '📝' },
}

interface ResumenMetodo {
  metodo: MetodoPago
  sistema: number
  moneda: 'USD' | 'VES'
  contado: string
  count: number
}

interface CorteHistorial {
  id: string
  created_at: string
  tipo: 'parcial' | 'final'
  total_sistema_usd: number
  total_sistema_ves: number
  diferencia_usd: number | null
  diferencia_ves: number | null
  comision_total_usd: number
  fondo_devuelto_usd: number
  fondo_devuelto_ves: number
  observaciones: string | null
  caja: { nombre: string; turno_inicio?: string; saldo_apertura_usd?: number; saldo_apertura_ves?: number } | null
  usuario: { nombre: string } | null
}

export default function CortesPage() {
  const [caja, setCaja] = useState<Caja | null>(null)
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [cargando, setCargando] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  const [saldoAperturaUsd, setSaldoAperturaUsd] = useState('')
  const [saldoAperturaVes, setSaldoAperturaVes] = useState('')
  const [turnoApertura, setTurnoApertura] = useState<1 | 2>(1)

  const [resumenMetodos, setResumenMetodos] = useState<ResumenMetodo[]>([])
  const [fondoDevueltoUsd, setFondoDevueltoUsd] = useState('')
  const [fondoDevueltoVes, setFondoDevueltoVes] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)

  // Premios de lotería pagados en la caja activa
  const [premiosLoteria, setPremiosLoteria] = useState<PremioBoleteria[]>([])

  // Historial de cierres
  const [historial, setHistorial] = useState<CorteHistorial[]>([])

  // Modal de eliminación
  const [modalEliminar, setModalEliminar] = useState<CorteHistorial | null>(null)
  const [passwordEliminar, setPasswordEliminar] = useState('')
  const [eliminando, setEliminando] = useState(false)

  // Tasa y modal de actualización
  const [tasa, setTasa] = useState<TasaCambio | null>(null)
  const [modalTasa, setModalTasa] = useState(false)
  const [tasaManualValor, setTasaManualValor] = useState('')
  const [tasaActualizando, setTasaActualizando] = useState(false)
  const [tasaMsg, setTasaMsg] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  // Formulario de apertura pendiente cuando el usuario elige continuar desde el modal
  const [pendingApertura, setPendingApertura] = useState<{ usd: number; ves: number; turno: 1 | 2 } | null>(null)

  const cargarCaja = useCallback(async () => {
    const res = await fetch('/api/cajas')
    if (res.ok) setCaja(await res.json())
    setCargando(false)
  }, [])

  const cargarHistorial = useCallback(async () => {
    const res = await fetch('/api/cortes')
    if (res.ok) setHistorial(await res.json())
  }, [])

  const cargarTransacciones = useCallback(async (cajaId: string) => {
    const res = await fetch(`/api/transacciones?caja_id=${cajaId}`)
    if (!res.ok) return
    const data: Transaccion[] = await res.json()
    setTransacciones(data)

    const totalesPorMetodo: Partial<Record<MetodoPago, number>> = {}
    const countPorMetodo: Partial<Record<MetodoPago, number>> = {}
    data.forEach(t => {
      if (t.anulada) return
      ;(t.pagos ?? []).forEach((p: { metodo: MetodoPago; monto: number }) => {
        totalesPorMetodo[p.metodo] = (totalesPorMetodo[p.metodo] ?? 0) + p.monto
        countPorMetodo[p.metodo] = (countPorMetodo[p.metodo] ?? 0) + 1
      })
    })

    const metodosUsados = Object.keys(totalesPorMetodo) as MetodoPago[]

    if (metodosUsados.length === 0) {
      const totalUsd = data.filter(t => !t.anulada).reduce((s, t) => s + t.total_usd, 0)
      const totalVes = data.filter(t => !t.anulada).reduce((s, t) => s + t.total_ves, 0)
      const filas: ResumenMetodo[] = []
      const ct = data.filter(t => !t.anulada).length
      if (totalUsd > 0) filas.push({ metodo: 'efectivo_usd', sistema: totalUsd, moneda: 'USD', contado: '', count: ct })
      if (totalVes > 0) filas.push({ metodo: 'efectivo_ves', sistema: totalVes, moneda: 'VES', contado: '', count: ct })
      setResumenMetodos(filas)
      return
    }

    const filas: ResumenMetodo[] = metodosUsados.map(metodo => ({
      metodo,
      sistema: totalesPorMetodo[metodo] ?? 0,
      moneda: METODOS_CONFIG[metodo].moneda,
      contado: '',
      count: countPorMetodo[metodo] ?? 0,
    }))

    filas.sort((a, b) => {
      const aDiv = METODOS_DIVISAS.includes(a.metodo) ? 0 : 1
      const bDiv = METODOS_DIVISAS.includes(b.metodo) ? 0 : 1
      return aDiv - bDiv
    })

    setResumenMetodos(filas)
  }, [])

  useEffect(() => {
    fetch('/api/tasa/vigente').then(r => r.ok ? r.json() : null).then(data => {
      if (data && !data.error) setTasa(data)
    })
  }, [])

  useEffect(() => {
    cargarCaja()
    cargarHistorial()
    // Obtener rol del usuario actual
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('rol').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.rol === 'admin' || data?.rol === 'supervisor') setEsAdmin(true)
        })
    })
  }, [cargarCaja, cargarHistorial])

  useEffect(() => {
    if (caja?.id) {
      cargarTransacciones(caja.id)
      fetch(`/api/boleteria/premios?caja_id=${caja.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setPremiosLoteria(Array.isArray(data) ? data : []))
    }
  }, [caja, cargarTransacciones])

  function mostrar(texto: string, tipo: 'ok' | 'error') {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  function actualizarContado(metodo: MetodoPago, valor: string) {
    setResumenMetodos(prev => prev.map(r => r.metodo === metodo ? { ...r, contado: valor } : r))
  }

  async function ejecutarApertura(usd: number, ves: number, turno: 1 | 2) {
    setProcesando(true)
    const res = await fetch('/api/cajas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saldo_apertura_usd: usd, saldo_apertura_ves: ves, turno }),
    })
    if (res.ok) {
      mostrar('Caja abierta correctamente', 'ok')
      await cargarCaja()
    } else {
      const d = await res.json()
      mostrar(d.error ?? 'Error al abrir caja', 'error')
    }
    setProcesando(false)
  }

  async function abrirCaja(e: React.FormEvent) {
    e.preventDefault()
    const usd = parseFloat(saldoAperturaUsd) || 0
    const ves = parseFloat(saldoAperturaVes) || 0
    // Si la tasa no está actualizada hoy, mostrar modal antes de abrir
    if (tasa?.stale) {
      setPendingApertura({ usd, ves, turno: turnoApertura })
      setModalTasa(true)
      setTasaMsg(null)
      setTasaManualValor('')
      return
    }
    await ejecutarApertura(usd, ves, turnoApertura)
  }

  async function tasaFetchBCV() {
    setTasaActualizando(true)
    setTasaMsg(null)
    const res = await fetch('/api/tasa/fetch-bcv', { method: 'POST' })
    if (res.ok) {
      const vigente = await fetch('/api/tasa/vigente').then(r => r.json())
      setTasa(vigente)
      setTasaMsg({ texto: `Tasa actualizada: Bs. ${vigente.tasa?.toFixed(2)}`, tipo: 'ok' })
    } else {
      setTasaMsg({ texto: 'No se pudo obtener la tasa del BCV. Ingresa manualmente.', tipo: 'error' })
    }
    setTasaActualizando(false)
  }

  async function tasaGuardarManual() {
    const valor = parseFloat(tasaManualValor)
    if (!valor || valor <= 0) {
      setTasaMsg({ texto: 'Ingresa un valor válido.', tipo: 'error' })
      return
    }
    setTasaActualizando(true)
    setTasaMsg(null)
    const res = await fetch('/api/tasa/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasa: valor }),
    })
    if (res.ok) {
      const vigente = await fetch('/api/tasa/vigente').then(r => r.json())
      setTasa(vigente)
      setTasaMsg({ texto: `Tasa guardada: Bs. ${valor.toFixed(2)}`, tipo: 'ok' })
    } else {
      const d = await res.json()
      setTasaMsg({ texto: d.error ?? 'Error al guardar tasa', tipo: 'error' })
    }
    setTasaActualizando(false)
  }

  async function cerrarModalTasaYAbrir(continuar: boolean) {
    setModalTasa(false)
    if (continuar && pendingApertura) {
      await ejecutarApertura(pendingApertura.usd, pendingApertura.ves, pendingApertura.turno)
    }
    setPendingApertura(null)
  }

  async function realizarCorte() {
    if (!caja) return
    setProcesando(true)

    const contadoUsd = resumenMetodos
      .filter(r => r.moneda === 'USD')
      .reduce((s, r) => s + (parseFloat(r.contado) || 0), 0)
    const contadoVes = resumenMetodos
      .filter(r => r.moneda === 'VES')
      .reduce((s, r) => s + (parseFloat(r.contado) || 0), 0)

    const res = await fetch('/api/cortes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caja_id: caja.id,
        tipo: 'final',
        efectivo_contado_usd: contadoUsd,
        efectivo_contado_ves: contadoVes,
        fondo_devuelto_usd: parseFloat(fondoDevueltoUsd) || 0,
        fondo_devuelto_ves: parseFloat(fondoDevueltoVes) || 0,
        observaciones,
        contado_por_metodo: Object.fromEntries(
          resumenMetodos.map(r => [r.metodo, parseFloat(r.contado) || 0])
        ),
      }),
    })

    if (res.ok) {
      mostrar('Caja cerrada correctamente', 'ok')
      setCaja(null)
      setTransacciones([])
      setResumenMetodos([])
      setFondoDevueltoUsd('')
      setFondoDevueltoVes('')
      setObservaciones('')
      await cargarHistorial()
    } else {
      const d = await res.json()
      mostrar(d.error ?? 'Error', 'error')
    }
    setProcesando(false)
  }

  async function eliminarCorte() {
    if (!modalEliminar) return
    setEliminando(true)
    const res = await fetch(`/api/cortes/${modalEliminar.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordEliminar }),
    })
    if (res.ok) {
      setHistorial(prev => prev.filter(c => c.id !== modalEliminar.id))
      setModalEliminar(null)
      setPasswordEliminar('')
      mostrar('Cierre eliminado', 'ok')
    } else {
      const d = await res.json()
      mostrar(d.error ?? 'Error al eliminar', 'error')
    }
    setEliminando(false)
  }

  const totalUsd = transacciones.filter(t => !t.anulada).reduce((s, t) => s + t.total_usd, 0)
  const totalVes = transacciones.filter(t => !t.anulada).reduce((s, t) => s + t.total_ves, 0)
  const totalComisiones = transacciones.filter(t => !t.anulada).reduce((s, t) => s + t.comision_total_usd, 0)

  if (cargando) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>

  const inputCls = "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold text-amber-400">Caja y Cierres</h1>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.tipo === 'ok' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Apertura */}
      {!caja && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <h2 className="font-semibold text-gray-100">Caja cerrada</h2>
          </div>
          <p className="text-sm text-gray-400">Selecciona el turno e ingresa el efectivo inicial.</p>
          <form onSubmit={abrirCaja} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-2">Turno</label>
              <div className="flex gap-2">
                {([1, 2] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTurnoApertura(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      turnoApertura === t
                        ? t === 1 ? 'bg-amber-600 text-white border-amber-600' : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                    }`}>
                    {t === 1 ? 'T1 — Mañana' : 'T2 — Tarde'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Saldo inicial USD</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={saldoAperturaUsd} onChange={e => setSaldoAperturaUsd(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Saldo inicial Bs.</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={saldoAperturaVes} onChange={e => setSaldoAperturaVes(e.target.value)}
                  className={inputCls} />
              </div>
            </div>
            <button type="submit" disabled={procesando}
              className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {procesando ? 'Abriendo...' : 'Abrir turno'}
            </button>
          </form>
        </div>
      )}

      {/* Caja abierta */}
      {caja && (
        <>
          {/* Resumen del turno */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="font-semibold text-gray-100">Turno activo</h2>
                {caja.turno && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    caja.turno === 1
                      ? 'bg-amber-900/50 text-amber-400 border border-amber-700'
                      : 'bg-blue-900/50 text-blue-400 border border-blue-700'
                  }`}>
                    {caja.turno === 1 ? 'T1 Mañana' : 'T2 Tarde'}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                Desde {new Date(caja.turno_inicio!).toLocaleString('es-VE')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Total USD</p>
                <p className="font-bold text-emerald-400 text-sm">{formatUSD(totalUsd)}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Total Bs.</p>
                <p className="font-bold text-blue-400 text-sm">{formatVES(totalVes)}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Comisiones</p>
                <p className="font-bold text-amber-400 text-sm">{formatUSD(totalComisiones)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-right">{transacciones.length} transacciones</p>
          </div>

          {/* Desglose por método de pago */}
          {resumenMetodos.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
              <h3 className="font-medium text-gray-100 text-sm">Transacciones por método de pago</h3>
              <div className="divide-y divide-gray-800">
                {resumenMetodos.map(r => {
                  const cfg = METODOS_CONFIG[r.metodo]
                  return (
                    <div key={r.metodo} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <span>{cfg.icono}</span>
                        <span className="text-sm text-gray-200">{cfg.label}</span>
                        <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{r.count} op.</span>
                      </div>
                      <span className={`font-semibold text-sm ${r.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-300'}`}>
                        {r.moneda === 'USD' ? formatUSD(r.sistema) : formatVES(r.sistema)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-700">
                {(['USD', 'VES'] as const).map(moneda => {
                  const total = resumenMetodos.filter(r => r.moneda === moneda).reduce((s, r) => s + r.sistema, 0)
                  if (!total) return null
                  return (
                    <div key={moneda} className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">{moneda === 'USD' ? 'Total Divisas' : 'Total Bs.'}</p>
                      <p className={`font-bold text-sm ${moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {moneda === 'USD' ? formatUSD(total) : formatVES(total)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cierre de turno */}
          <div className="bg-gray-900 border border-red-800 rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-red-400">Cierre de turno</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ingresa los montos recibidos por cada método de pago.</p>
            </div>

            {/* Tabla de arqueo por método */}
            <div className="space-y-2">
              {resumenMetodos.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">Sin transacciones en este turno</p>
              )}
              {resumenMetodos.map(r => {
                const cfg = METODOS_CONFIG[r.metodo]
                const contadoNum = parseFloat(r.contado) || 0
                const diff = contadoNum - r.sistema
                const hayDiff = r.contado !== ''
                return (
                  <div key={r.metodo} className="border border-gray-700 rounded-lg p-3 space-y-2 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span>{cfg.icono}</span>
                        <span className="text-sm font-medium text-gray-200">{cfg.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-400">Sistema: </span>
                        <span className="text-sm font-bold text-gray-100">
                          {r.moneda === 'USD' ? formatUSD(r.sistema) : formatVES(r.sistema)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number" step="0.01" min="0"
                          placeholder={`Contado (${r.moneda === 'USD' ? 'USD' : 'Bs.'})`}
                          value={r.contado}
                          onChange={e => actualizarContado(r.metodo, e.target.value)}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                          {r.moneda === 'USD' ? '$' : 'Bs.'}
                        </span>
                      </div>
                      {hayDiff && (
                        <span className={`text-xs font-semibold shrink-0 ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {diff >= 0 ? '+' : ''}{r.moneda === 'USD' ? formatUSD(diff) : formatVES(diff)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Fondo de caja devuelto */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2 bg-gray-800/30">
              <p className="text-xs font-semibold text-gray-300">Fondo de caja devuelto</p>
              <p className="text-xs text-gray-500">Ingresa el monto del fondo inicial que se está devolviendo.</p>
              <div className="grid grid-cols-2 gap-2">
                {(caja.saldo_apertura_usd ?? 0) > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">
                      Fondo USD <span className="text-gray-500">(entregado: {formatUSD(caja.saldo_apertura_usd ?? 0)})</span>
                    </label>
                    <div className="relative">
                      <input type="number" step="0.01" min="0"
                        placeholder="0.00"
                        value={fondoDevueltoUsd}
                        onChange={e => setFondoDevueltoUsd(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                    </div>
                  </div>
                )}
                {(caja.saldo_apertura_ves ?? 0) > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">
                      Fondo Bs. <span className="text-gray-500">(entregado: {formatVES(caja.saldo_apertura_ves ?? 0)})</span>
                    </label>
                    <div className="relative">
                      <input type="number" step="0.01" min="0"
                        placeholder="0.00"
                        value={fondoDevueltoVes}
                        onChange={e => setFondoDevueltoVes(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Bs.</span>
                    </div>
                  </div>
                )}
                {(caja.saldo_apertura_usd ?? 0) === 0 && (caja.saldo_apertura_ves ?? 0) === 0 && (
                  <p className="col-span-2 text-xs text-gray-500 italic">Sin fondo de apertura registrado.</p>
                )}
              </div>
            </div>

            {/* Arqueo totalizado */}
            <div className="bg-gray-800 rounded-lg p-3 space-y-4 text-sm">
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Arqueo de caja</p>
              {(['USD', 'VES'] as const).map(moneda => {
                const filasMoneda = resumenMetodos.filter(r => r.moneda === moneda)
                const apertura = moneda === 'USD' ? (caja.saldo_apertura_usd ?? 0) : (caja.saldo_apertura_ves ?? 0)
                const ventas = filasMoneda.reduce((s, r) => s + r.sistema, 0)
                const premios = premiosLoteria
                  .filter(p => p.moneda === moneda && p.fuente === 'caja')
                  .reduce((s, p) => s + p.monto, 0)
                const contadoVentas = filasMoneda.reduce((s, r) => s + (parseFloat(r.contado) || 0), 0)
                const hayContadoVentas = filasMoneda.some(r => r.contado !== '')
                const fondoDevuelto = moneda === 'USD'
                  ? (parseFloat(fondoDevueltoUsd) || 0)
                  : (parseFloat(fondoDevueltoVes) || 0)
                const hayFondo = moneda === 'USD' ? fondoDevueltoUsd !== '' : fondoDevueltoVes !== ''

                // Nada que mostrar si no hay ventas ni fondo
                if (!ventas && !apertura) return null

                const difVentas = contadoVentas - (ventas - premios)
                const difFondo = fondoDevuelto - apertura
                const difTotal = difVentas + difFondo
                const hayDif = hayContadoVentas || hayFondo
                const fmt = moneda === 'USD' ? formatUSD : formatVES

                return (
                  <div key={moneda} className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-400 border-b border-gray-700 pb-1">
                      {moneda === 'USD' ? '— Divisas (USD) —' : '— Bolívares —'}
                    </p>

                    {/* Sección ventas */}
                    {ventas > 0 && (
                      <>
                        <div className="flex justify-between text-gray-400">
                          <span>Ventas sistema</span><span className="text-gray-300">{fmt(ventas)}</span>
                        </div>
                        {premios > 0 && (
                          <div className="flex justify-between text-amber-400/80">
                            <span>− Premios lotería pagados</span><span>−{fmt(premios)}</span>
                          </div>
                        )}
                        {hayContadoVentas && (
                          <div className="flex justify-between text-gray-400">
                            <span>Contado ventas</span><span className="text-gray-300">{fmt(contadoVentas)}</span>
                          </div>
                        )}
                        {hayContadoVentas && (
                          <div className={`flex justify-between text-xs pl-2 ${difVentas >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            <span>Dif. ventas</span>
                            <span>{difVentas >= 0 ? '+' : ''}{fmt(difVentas)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Sección fondo */}
                    {apertura > 0 && (
                      <>
                        <div className="flex justify-between text-gray-400 border-t border-gray-700/50 pt-1.5 mt-1">
                          <span>Fondo entregado</span><span className="text-gray-300">{fmt(apertura)}</span>
                        </div>
                        {hayFondo && (
                          <div className="flex justify-between text-gray-400">
                            <span>Fondo devuelto</span><span className="text-gray-300">{fmt(fondoDevuelto)}</span>
                          </div>
                        )}
                        {hayFondo && (
                          <div className={`flex justify-between text-xs pl-2 ${difFondo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            <span>Dif. fondo</span>
                            <span>{difFondo >= 0 ? '+' : ''}{fmt(difFondo)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Diferencia total */}
                    {hayDif && (
                      <div className={`flex justify-between font-bold border-t border-gray-600 pt-1.5 mt-1 ${difTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span>{difTotal >= 0 ? '▲ Sobrante total' : '▼ Faltante total'}</span>
                        <span>{difTotal >= 0 ? '+' : ''}{fmt(difTotal)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Premios pagados con fondo externo — solo informativo, no afectan el arqueo */}
            {premiosLoteria.some(p => p.fuente === 'externo') && (
              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-yellow-400">Premios con fondo externo (informativo — no afectan el arqueo)</p>
                {premiosLoteria.filter(p => p.fuente === 'externo').map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-gray-300">
                    <span>
                      {p.producto?.nombre ?? 'Premio'} ·{' '}
                      {p.metodo_externo === 'pago_movil' ? 'Pago Móvil' : 'Efectivo'}
                      {p.observaciones ? ` · ${p.observaciones}` : ''}
                    </span>
                    <span className={p.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}>
                      {p.moneda === 'USD' ? formatUSD(p.monto) : formatVES(p.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <input type="text" placeholder="Observaciones del cierre..."
              value={observaciones} onChange={e => setObservaciones(e.target.value)}
              className={inputCls} />

            <button onClick={realizarCorte} disabled={procesando}
              className="w-full bg-red-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-red-800 disabled:opacity-50 transition-colors">
              {procesando ? 'Cerrando...' : 'Cerrar turno'}
            </button>
          </div>
        </>
      )}

      {/* Historial de cierres */}
      {historial.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-gray-100 text-sm">Historial de cierres</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {historial.map(corte => (
              <div key={corte.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-100">
                        {corte.usuario?.nombre ?? '—'}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${
                        corte.tipo === 'final'
                          ? 'bg-red-900/40 text-red-300 border-red-700'
                          : 'bg-amber-900/40 text-amber-300 border-amber-700'
                      }`}>
                        {corte.tipo === 'final' ? 'Cierre final' : 'Parcial'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {corte.caja?.nombre ?? '—'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(corte.created_at).toLocaleString('es-VE')}
                    </p>
                  </div>
                  {esAdmin && (
                    <button
                      onClick={() => { setModalEliminar(corte); setPasswordEliminar('') }}
                      className="shrink-0 text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-700 px-2 py-1 rounded-lg transition-colors"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Sistema USD</span>
                    <p className="font-semibold text-emerald-400">{formatUSD(corte.total_sistema_usd)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Sistema Bs.</span>
                    <p className="font-semibold text-blue-400">{formatVES(corte.total_sistema_ves)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Comisiones</span>
                    <p className="font-semibold text-amber-400">{formatUSD(corte.comision_total_usd)}</p>
                  </div>
                  {corte.diferencia_usd !== null && (
                    <div>
                      <span className="text-gray-500">Dif. USD</span>
                      <p className={`font-semibold ${(corte.diferencia_usd ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatUSD(corte.diferencia_usd ?? 0)}
                      </p>
                    </div>
                  )}
                  {corte.diferencia_ves !== null && (
                    <div>
                      <span className="text-gray-500">Dif. Bs.</span>
                      <p className={`font-semibold ${(corte.diferencia_ves ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatVES(corte.diferencia_ves ?? 0)}
                      </p>
                    </div>
                  )}
                  {(corte.fondo_devuelto_usd > 0 || corte.fondo_devuelto_ves > 0) && (
                    <>
                      {corte.fondo_devuelto_usd > 0 && (
                        <div>
                          <span className="text-gray-500">Fondo dev. USD</span>
                          <p className={`font-semibold ${corte.fondo_devuelto_usd >= (corte.caja?.saldo_apertura_usd ?? 0) ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {formatUSD(corte.fondo_devuelto_usd)}
                            {corte.caja?.saldo_apertura_usd ? ` / ${formatUSD(corte.caja.saldo_apertura_usd)}` : ''}
                          </p>
                        </div>
                      )}
                      {corte.fondo_devuelto_ves > 0 && (
                        <div>
                          <span className="text-gray-500">Fondo dev. Bs.</span>
                          <p className={`font-semibold ${corte.fondo_devuelto_ves >= (corte.caja?.saldo_apertura_ves ?? 0) ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {formatVES(corte.fondo_devuelto_ves)}
                            {corte.caja?.saldo_apertura_ves ? ` / ${formatVES(corte.caja.saldo_apertura_ves)}` : ''}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {corte.observaciones && (
                  <p className="text-xs text-gray-500 italic">{corte.observaciones}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal actualización de tasa */}
      {modalTasa && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-amber-700 rounded-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-amber-400 text-base">Tasa BCV sin actualizar</h3>
                <p className="text-xs text-gray-400 mt-1">
                  La tasa de cambio no ha sido actualizada hoy. Se recomienda actualizarla antes de iniciar el turno.
                  {tasa && (
                    <span className="block mt-1 text-gray-500">
                      Última tasa registrada: <span className="text-gray-300 font-medium">Bs. {tasa.tasa?.toFixed(2)}</span>
                      {' '}({new Date(tasa.created_at).toLocaleDateString('es-VE')})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Mensaje de feedback */}
            {tasaMsg && (
              <div className={`rounded-lg px-3 py-2 text-xs border ${
                tasaMsg.tipo === 'ok'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                  : 'bg-red-900/40 text-red-300 border-red-700'
              }`}>
                {tasaMsg.texto}
              </div>
            )}

            {/* Botón BCV automático */}
            <button
              onClick={tasaFetchBCV}
              disabled={tasaActualizando || tasa?.stale === false}
              className="w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {tasaActualizando ? 'Consultando BCV...' : tasa?.stale === false ? 'Tasa actualizada ✓' : 'Obtener tasa del BCV'}
            </button>

            {/* Ingreso manual */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-300 block">O ingresa la tasa manualmente (Bs./USD)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 92.50"
                  value={tasaManualValor}
                  onChange={e => setTasaManualValor(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  onKeyDown={e => e.key === 'Enter' && tasaGuardarManual()}
                />
                <button
                  onClick={tasaGuardarManual}
                  disabled={tasaActualizando || !tasaManualValor}
                  className="bg-amber-700 hover:bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => cerrarModalTasaYAbrir(true)}
                disabled={procesando}
                className="flex-1 border border-gray-600 text-gray-400 rounded-lg py-2 text-xs hover:bg-gray-800 transition-colors"
              >
                Continuar sin actualizar
              </button>
              {tasa?.stale === false && (
                <button
                  onClick={() => cerrarModalTasaYAbrir(true)}
                  disabled={procesando}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Abrir turno
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar cierre */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-800 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-red-400">Eliminar cierre</h3>
            <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1">
              <p className="text-gray-300 font-medium">{modalEliminar.usuario?.nombre ?? '—'}</p>
              <p className="text-gray-500">{new Date(modalEliminar.created_at).toLocaleString('es-VE')}</p>
              <p className="text-gray-500">{modalEliminar.caja?.nombre ?? '—'}</p>
            </div>
            <p className="text-xs text-gray-400">
              Confirma con tu contraseña de administrador para eliminar este cierre permanentemente.
            </p>
            <input
              type="password"
              placeholder="Contraseña de administrador"
              value={passwordEliminar}
              onChange={e => setPasswordEliminar(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && passwordEliminar && eliminarCorte()}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={eliminarCorte}
                disabled={!passwordEliminar || eliminando}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {eliminando ? 'Verificando...' : 'Confirmar eliminación'}
              </button>
              <button
                onClick={() => { setModalEliminar(null); setPasswordEliminar('') }}
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
