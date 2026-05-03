'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SemanaBoleteria, FilaArqueoLoteria, Producto, PremioBoleteria } from '@/types'
import { createClient } from '@/lib/supabase/client'

// ─── helpers ────────────────────────────────────────────────────────────────

function getLunesActual(): Date {
  const hoy = new Date()
  const dia = hoy.getDay() // 0=dom, 1=lun
  const diff = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diff)
  return lunes
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtMonto(n: number, moneda: 'USD' | 'VES') {
  return moneda === 'USD'
    ? `$ ${n.toFixed(2)}`
    : `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── component ──────────────────────────────────────────────────────────────

export default function BoleteriaPage() {
  const [semana, setSemana] = useState<SemanaBoleteria | null>(null)
  const [filas, setFilas] = useState<FilaArqueoLoteria[]>([])
  const [historial, setHistorial] = useState<SemanaBoleteria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [premios, setPremios] = useState<PremioBoleteria[]>([])
  const [totalPremiosUSD, setTotalPremiosUSD] = useState(0)
  const [totalPremiosVES, setTotalPremiosVES] = useState(0)
  const [historialPremios, setHistorialPremios] = useState<PremioBoleteria[]>([])
  const [cajaId, setCajaId] = useState<string | null>(null)
  const [esAdmin, setEsAdmin] = useState(false)

  const [semanaExpandida, setSemanaExpandida] = useState<string | null>(null)
  const [modalRecepciones, setModalRecepciones] = useState(false)
  const [modalArqueo, setModalArqueo] = useState(false)
  const [modalPremio, setModalPremio] = useState(false)
  const [modalVentas, setModalVentas] = useState(false)

  // Ajuste manual de vendidos (solo admin)
  const [modoAjuste, setModoAjuste] = useState(false)
  const [ajustesVendidos, setAjustesVendidos] = useState<Record<string, string>>({})
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)

  // Consulta de ventas por fecha
  type VentaProd = {
    producto_id: string; nombre: string; cantidad: number
    cantidad_inferida: boolean; precio_usd_unitario: number
  }
  type VentaItem = {
    transaccion_id: string; created_at: string; anulada: boolean
    total_usd: number; total_ves: number
    caja_nombre: string; turno: number | null; usuario_nombre: string
    productos: VentaProd[]
  }
  const hoyVET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
  const hoyStr = new Date().toISOString().split('T')[0]
  const [modalConsultaVentas, setModalConsultaVentas] = useState(false)
  const [consultaDesde, setConsultaDesde] = useState(hoyStr)
  const [consultaHasta, setConsultaHasta] = useState(hoyStr)
  const [ventasConsulta, setVentasConsulta] = useState<VentaItem[]>([])
  const [cargandoConsulta, setCargandoConsulta] = useState(false)
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [notasArqueo, setNotasArqueo] = useState('')
  const [guardando, setGuardando] = useState(false)

  // ── Arqueo diario por turno ──
  const [modalArqueoDiario, setModalArqueoDiario] = useState(false)
  const [arqueoDia, setArqueoDia] = useState(hoyVET)
  const [ventasArqueo, setVentasArqueo] = useState<VentaItem[]>([])
  const [cargandoArqueo, setCargandoArqueo] = useState(false)
  const [errorArqueo, setErrorArqueo] = useState<string | null>(null)

  // Ventas (transacciones con tickets) para admin
  type VentaLoteria = {
    transaccion_id: string; created_at: string; anulada: boolean
    caja_nombre: string; usuario_nombre: string
    items: { producto_id: string; nombre_producto: string; precio_usd: number }[]
  }
  const [ventas, setVentas] = useState<VentaLoteria[]>([])

  // Estado del modal de premio
  const [premioProdId, setPremioProdId] = useState('')
  const [premioTipo, setPremioTipo] = useState<'reintegro' | 'mayor'>('reintegro')
  const [premioMoneda, setPremioMoneda] = useState<'USD' | 'VES'>('VES')
  const [premioMonto, setPremioMonto] = useState('')
  const [premioFuente, setPremioFuente] = useState<'caja' | 'externo'>('caja')
  const [premioMetodoExterno, setPremioMetodoExterno] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [premioObs, setPremioObs] = useState('')

  // Estado del modal de edición de premio
  const [editandoPremio, setEditandoPremio] = useState<PremioBoleteria | null>(null)
  const [editProdId, setEditProdId] = useState('')
  const [editTipo, setEditTipo] = useState<'reintegro' | 'mayor'>('reintegro')
  const [editMoneda, setEditMoneda] = useState<'USD' | 'VES'>('VES')
  const [editMonto, setEditMonto] = useState('')
  const [editFuente, setEditFuente] = useState<'caja' | 'externo'>('caja')
  const [editMetodo, setEditMetodo] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [editObs, setEditObs] = useState('')
  const [editGuardando, setEditGuardando] = useState(false)

  const esLunes = new Date().getDay() === 1
  const esDomingo = new Date().getDay() === 0

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [rSemana, rHistorial, rProductos, rHistPremios] = await Promise.all([
        fetch('/api/boleteria/semana-actual').then(r => r.json()),
        fetch('/api/boleteria/semanas').then(r => r.json()),
        fetch('/api/productos?activo=true').then(r => r.json()),
        fetch('/api/boleteria/premios').then(r => r.json()),
      ])
      setSemana(rSemana.semana ?? null)
      setFilas(rSemana.filas ?? [])
      setPremios(rSemana.premios ?? [])
      setTotalPremiosUSD(rSemana.total_premios_usd ?? 0)
      setTotalPremiosVES(rSemana.total_premios_ves ?? 0)
      setHistorial(Array.isArray(rHistorial) ? rHistorial : [])
      setHistorialPremios(Array.isArray(rHistPremios) ? rHistPremios : [])
      if (Array.isArray(rProductos)) {
        const loterias = rProductos.filter(
          (p: Producto & { categoria?: { nombre: string } }) =>
            p.categoria?.nombre === 'Boleteria'
        )
        setProductos(loterias)
      }
    } catch {
      setError('No se pudieron cargar los datos')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
    fetch('/api/cajas').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.id) setCajaId(data.id)
    })
    // Rol del usuario
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) return
      supabase.from('usuarios').select('rol').eq('id', u.id).single()
        .then(({ data }) => { if (['admin', 'supervisor'].includes(data?.rol ?? '')) setEsAdmin(true) })
    })
  }, [cargar])

  // ── iniciar semana ──
  async function iniciarSemana() {
    setGuardando(true)
    try {
      const r = await fetch('/api/boleteria/semanas', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) { setError(data.error); return }
      await cargar()
      setModalRecepciones(true)
    } finally {
      setGuardando(false)
    }
  }

  // ── guardar recepciones ──
  async function guardarRecepciones() {
    if (!semana) return
    setGuardando(true)
    try {
      const recepciones = Object.entries(cantidades)
        .filter(([, v]) => v > 0)
        .map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
      const r = await fetch(`/api/boleteria/semanas/${semana.id}/recepciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recepciones }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error); return }
      setCantidades({})
      setModalRecepciones(false)
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  // ── guardar ajuste manual de vendidos ──
  async function guardarAjustes() {
    if (!semana) return
    setGuardandoAjuste(true)
    try {
      const ajustes = filas.map(f => ({
        producto_id: f.producto_id,
        vendidos_manual: ajustesVendidos[f.producto_id] !== undefined
          ? (ajustesVendidos[f.producto_id] === '' ? null : parseInt(ajustesVendidos[f.producto_id]))
          : undefined,
      })).filter(a => a.vendidos_manual !== undefined) as { producto_id: string; vendidos_manual: number | null }[]

      if (!ajustes.length) { setModoAjuste(false); return }

      const r = await fetch(`/api/boleteria/semanas/${semana.id}/recepciones`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ajustes }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? 'Error al guardar ajuste'); return }
      setModoAjuste(false)
      setAjustesVendidos({})
      await cargar()
    } finally {
      setGuardandoAjuste(false)
    }
  }

  // ── cargar ventas de la semana (admin) ──
  async function cargarVentas() {
    if (!semana) return
    const r = await fetch(`/api/boleteria/semanas/${semana.id}/ventas`)
    if (r.ok) setVentas(await r.json())
  }

  // ── anular venta ──
  async function anularVenta(transaccion_id: string) {
    if (!confirm('¿Anular esta venta? No se puede deshacer.')) return
    const r = await fetch(`/api/transacciones/${transaccion_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anulada: true }),
    })
    const data = await r.json()
    if (!r.ok) { setError(data.error); return }
    // Actualizar lista local y recargar filas
    setVentas(prev => prev.map(v => v.transaccion_id === transaccion_id ? { ...v, anulada: true } : v))
    await cargar()
  }

  // ── registrar premio ──
  async function registrarPremio() {
    if (!semana || !cajaId) return
    if (!premioMonto || parseFloat(premioMonto) <= 0) { setError('Ingresa un monto válido'); return }
    setGuardando(true)
    try {
      const r = await fetch(`/api/boleteria/semanas/${semana.id}/premios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caja_id: cajaId,
          producto_id: premioProdId || null,
          tipo: premioTipo,
          moneda: premioMoneda,
          monto: parseFloat(premioMonto),
          observaciones: premioObs || null,
          fuente: premioFuente,
          metodo_externo: premioFuente === 'externo' ? premioMetodoExterno : null,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error); return }
      setModalPremio(false)
      setPremioProdId('')
      setPremioTipo('reintegro')
      setPremioMoneda('VES')
      setPremioMonto('')
      setPremioFuente('caja')
      setPremioMetodoExterno('efectivo')
      setPremioObs('')
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  // ── abrir edición de premio ──
  function abrirEdicionPremio(p: PremioBoleteria) {
    setEditandoPremio(p)
    setEditProdId(p.producto_id ?? '')
    setEditTipo(p.tipo)
    setEditMoneda(p.moneda)
    setEditMonto(String(p.monto))
    setEditFuente(p.fuente)
    setEditMetodo(p.metodo_externo ?? 'efectivo')
    setEditObs(p.observaciones ?? '')
  }

  // ── guardar edición de premio ──
  async function guardarEdicionPremio() {
    if (!editandoPremio) return
    if (!editMonto || parseFloat(editMonto) <= 0) { setError('El monto debe ser mayor a cero'); return }
    setEditGuardando(true)
    try {
      const r = await fetch(`/api/boleteria/premios/${editandoPremio.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: editProdId || null,
          tipo: editTipo,
          moneda: editMoneda,
          monto: parseFloat(editMonto),
          fuente: editFuente,
          metodo_externo: editFuente === 'externo' ? editMetodo : null,
          observaciones: editObs || null,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? 'Error al guardar'); return }
      setEditandoPremio(null)
      await cargar()
    } finally {
      setEditGuardando(false)
    }
  }

  // ── anular premio (admin) ──
  async function anularPremio(id: string) {
    if (!confirm('¿Anular este premio? Esta acción no se puede deshacer.')) return
    const r = await fetch(`/api/boleteria/premios/${id}`, { method: 'DELETE' })
    const data = await r.json()
    if (!r.ok) { setError(data.error ?? 'Error al anular'); return }
    await cargar()
  }

  // ── consultar ventas por fecha ──
  async function consultarVentas() {
    if (!consultaDesde || !consultaHasta) return
    setCargandoConsulta(true)
    setErrorConsulta(null)
    try {
      const r = await fetch(`/api/boleteria/ventas?desde=${consultaDesde}&hasta=${consultaHasta}`)
      const data = await r.json()
      if (!r.ok) { setErrorConsulta(data.error ?? 'Error al consultar'); return }
      setVentasConsulta(Array.isArray(data) ? data : [])
    } catch {
      setErrorConsulta('Error al consultar ventas')
    } finally {
      setCargandoConsulta(false)
    }
  }

  // ── cargar arqueo diario ──
  async function cargarArqueo(dia: string) {
    setCargandoArqueo(true)
    setErrorArqueo(null)
    try {
      const r = await fetch(`/api/boleteria/ventas?desde=${dia}&hasta=${dia}`)
      const data = await r.json()
      if (!r.ok) { setErrorArqueo(data.error ?? 'Error al cargar'); return }
      setVentasArqueo(Array.isArray(data) ? data : [])
    } catch {
      setErrorArqueo('Error al cargar arqueo')
    } finally {
      setCargandoArqueo(false)
    }
  }

  // ── cerrar semana ──
  async function cerrarSemana() {
    if (!semana) return
    setGuardando(true)
    try {
      const r = await fetch(`/api/boleteria/semanas/${semana.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'cerrada',
          notas: notasArqueo || null,
          cierre_recibidos_usd: totalUSD.recibidos,
          cierre_vendidos_usd:  totalUSD.vendidos,
          cierre_ingreso_usd:   totalUSD.ingreso,
          cierre_comision_usd:  totalUSD.comision,
          cierre_deuda_usd:     totalUSD.deuda,
          cierre_premios_usd:   totalPremiosUSD,
          cierre_recibidos_ves: totalVES.recibidos,
          cierre_vendidos_ves:  totalVES.vendidos,
          cierre_ingreso_ves:   totalVES.ingreso,
          cierre_comision_ves:  totalVES.comision,
          cierre_deuda_ves:     totalVES.deuda,
          cierre_premios_ves:   totalPremiosVES,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error); return }
      setModalArqueo(false)
      setNotasArqueo('')
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  // ── ajustes por premios ──
  const reintegrosPorProd = new Map<string, number>()
  const mayorPorProd = new Map<string, number>() // key: "producto_id:moneda"
  for (const p of premios) {
    if (!p.producto_id) continue
    if (p.tipo === 'reintegro') {
      reintegrosPorProd.set(p.producto_id, (reintegrosPorProd.get(p.producto_id) ?? 0) + 1)
    } else if (p.tipo === 'mayor') {
      const k = `${p.producto_id}:${p.moneda}`
      mayorPorProd.set(k, (mayorPorProd.get(k) ?? 0) + p.monto)
    }
  }
  const filasAjustadas: FilaArqueoLoteria[] = filas.map(f => {
    const nRei  = reintegrosPorProd.get(f.producto_id) ?? 0
    const mayor = mayorPorProd.get(`${f.producto_id}:${f.moneda}`) ?? 0
    const vAj   = Math.max(0, f.vendidos - nRei)
    return {
      ...f,
      vendidos:        vAj,
      disponibles:     f.recibidos - vAj - nRei,
      ingreso_bruto:   f.precio * vAj,
      comision_total:  f.comision * vAj,
      deuda_proveedor: Math.max(0, f.costo * vAj - mayor),
    }
  })
  // Premios mayores sin producto vinculado → deducción global
  const mayorSinProdUSD = premios.filter(p => !p.producto_id && p.tipo === 'mayor' && p.moneda === 'USD').reduce((s, p) => s + p.monto, 0)
  const mayorSinProdVES = premios.filter(p => !p.producto_id && p.tipo === 'mayor' && p.moneda === 'VES').reduce((s, p) => s + p.monto, 0)

  // ── totales por moneda (ajustados) ──
  const totalUSD = {
    recibidos:  filasAjustadas.filter(f => f.moneda === 'USD').reduce((a, f) => a + f.recibidos, 0),
    vendidos:   filasAjustadas.filter(f => f.moneda === 'USD').reduce((a, f) => a + f.vendidos, 0),
    ingreso:    filasAjustadas.filter(f => f.moneda === 'USD').reduce((a, f) => a + f.ingreso_bruto, 0),
    comision:   filasAjustadas.filter(f => f.moneda === 'USD').reduce((a, f) => a + f.comision_total, 0),
    deuda:      Math.max(0, filasAjustadas.filter(f => f.moneda === 'USD').reduce((a, f) => a + f.deuda_proveedor, 0) - mayorSinProdUSD),
  }
  const totalVES = {
    recibidos:  filasAjustadas.filter(f => f.moneda === 'VES').reduce((a, f) => a + f.recibidos, 0),
    vendidos:   filasAjustadas.filter(f => f.moneda === 'VES').reduce((a, f) => a + f.vendidos, 0),
    ingreso:    filasAjustadas.filter(f => f.moneda === 'VES').reduce((a, f) => a + f.ingreso_bruto, 0),
    comision:   filasAjustadas.filter(f => f.moneda === 'VES').reduce((a, f) => a + f.comision_total, 0),
    deuda:      Math.max(0, filasAjustadas.filter(f => f.moneda === 'VES').reduce((a, f) => a + f.deuda_proveedor, 0) - mayorSinProdVES),
  }

  const lunesStr = formatFecha(getLunesActual().toISOString().split('T')[0])

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Cargando…
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-amber-400">Boletería</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setModalArqueoDiario(true)
              setArqueoDia(hoyVET)
              cargarArqueo(hoyVET)
            }}
            className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Arqueo por turno
          </button>
          <button
            onClick={() => { setModalConsultaVentas(true); setVentasConsulta([]); setErrorConsulta(null) }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Consultar ventas
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Banner lunes ── */}
      {esLunes && !semana && (
        <div className="bg-amber-900/30 border border-amber-600 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-amber-300 font-semibold">Hoy es lunes — inicio de semana</p>
            <p className="text-amber-200/70 text-sm mt-1">
              Inicia la semana y registra los tickets recibidos del proveedor.
            </p>
          </div>
          <button
            onClick={iniciarSemana}
            disabled={guardando}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm whitespace-nowrap"
          >
            Iniciar semana
          </button>
        </div>
      )}

      {/* ── Sin semana (no es lunes) ── */}
      {!semana && !esLunes && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-gray-400">No hay una semana activa.</p>
          <button
            onClick={iniciarSemana}
            disabled={guardando}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm"
          >
            Iniciar semana ahora
          </button>
        </div>
      )}

      {/* ── Semana activa ── */}
      {semana && (
        <>
          {/* Header */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-semibold text-white">Semana Boletería</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  semana.estado === 'abierta'
                    ? 'bg-green-900/50 text-green-400 border border-green-700'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {semana.estado.toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-1">
                {formatFecha(semana.fecha_inicio)} – {formatFecha(semana.fecha_fin)}
              </p>
            </div>
            {semana.estado === 'abierta' && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    // Pre-llenar con cantidades actuales
                    const init: Record<string, number> = {}
                    productos.forEach(p => {
                      const fila = filas.find(f => f.producto_id === p.id)
                      init[p.id] = fila?.recibidos ?? 0
                    })
                    setCantidades(init)
                    setModalRecepciones(true)
                  }}
                  className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {filas.some(f => f.recibidos > 0) ? 'Editar recepción' : 'Registrar recepción'}
                </button>
                {esAdmin && (
                  <>
                    <button
                      onClick={() => { cargarVentas(); setModalVentas(true) }}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Ver / anular ventas
                    </button>
                    {!modoAjuste ? (
                      <button
                        onClick={() => {
                          const init: Record<string, string> = {}
                          for (const f of filas) {
                            init[f.producto_id] = f.vendidos_manual !== null && f.vendidos_manual !== undefined
                              ? String(f.vendidos_manual)
                              : ''
                          }
                          setAjustesVendidos(init)
                          setModoAjuste(true)
                        }}
                        className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        Ajustar vendidos
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={guardarAjustes}
                          disabled={guardandoAjuste}
                          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          {guardandoAjuste ? 'Guardando…' : 'Guardar ajuste'}
                        </button>
                        <button
                          onClick={() => { setModoAjuste(false); setAjustesVendidos({}) }}
                          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={() => {
                    setPremioTipo('reintegro')
                    setPremioMoneda('VES')
                    setPremioMonto('')
                    setPremioObs('')
                    setPremioProdId('')
                    setModalPremio(true)
                  }}
                  className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Registrar premio
                </button>
                <button
                  onClick={() => setModalArqueo(true)}
                  className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {esDomingo ? 'Arqueo / Cerrar semana' : 'Cerrar semana'}
                </button>
              </div>
            )}
          </div>

          {/* Tabla de control */}
          {filasAjustadas.length === 0 ? (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
              Sin productos en la categoría "Boleteria". Verifica que existan productos activos con esa categoría.
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-800">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Producto</th>
                      <th className="text-center px-3 py-3 text-gray-400 font-medium">Moneda</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Recibidos</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Vendidos</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Disponibles</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">P. Venta</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Costo</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Comisión %</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Ingreso</th>
                      <th className="text-right px-3 py-3 text-gray-400 font-medium">Comisión</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Deuda Prov.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasAjustadas.map((f, i) => {
                      const nRei   = reintegrosPorProd.get(f.producto_id) ?? 0
                      const mayor  = mayorPorProd.get(`${f.producto_id}:${f.moneda}`) ?? 0
                      return (
                        <tr key={f.producto_id} className={`border-b border-gray-800 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                          <td className="px-4 py-3 text-white font-medium">{f.nombre}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              f.moneda === 'USD'
                                ? 'bg-green-900/50 text-green-400 border border-green-800'
                                : 'bg-blue-900/50 text-blue-400 border border-blue-800'
                            }`}>
                              {f.moneda}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-gray-300">{f.recibidos}</td>
                          <td className="px-3 py-3 text-right">
                            {modoAjuste ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  value={ajustesVendidos[f.producto_id] ?? ''}
                                  onChange={e => setAjustesVendidos(prev => ({ ...prev, [f.producto_id]: e.target.value }))}
                                  placeholder={String(f.vendidos_calculado ?? f.vendidos)}
                                  className="w-20 bg-gray-700 border border-blue-600 text-white text-right rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-500">calc: {f.vendidos_calculado ?? f.vendidos}</span>
                              </div>
                            ) : (
                              <>
                                <div className={f.vendidos_manual !== null && f.vendidos_manual !== undefined ? 'text-blue-300 font-medium' : 'text-gray-300'}>
                                  {f.vendidos}
                                  {f.vendidos_manual !== null && f.vendidos_manual !== undefined && (
                                    <span className="ml-1 text-xs text-blue-500" title={`Calculado: ${f.vendidos_calculado}`}>✎</span>
                                  )}
                                </div>
                                {nRei > 0 && <div className="text-xs text-blue-400">−{nRei} rei.</div>}
                              </>
                            )}
                          </td>
                          <td className={`px-3 py-3 text-right font-medium ${
                            f.disponibles < 0 ? 'text-red-400' : f.disponibles === 0 ? 'text-gray-500' : 'text-white'
                          }`}>
                            {f.disponibles}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-300">{fmtMonto(f.precio, f.moneda)}</td>
                          <td className="px-3 py-3 text-right text-gray-300">{fmtMonto(f.costo, f.moneda)}</td>
                          <td className="px-3 py-3 text-right text-amber-400">{f.comision_pct.toFixed(1)}%</td>
                          <td className="px-3 py-3 text-right text-gray-300">{fmtMonto(f.ingreso_bruto, f.moneda)}</td>
                          <td className="px-3 py-3 text-right text-green-400">{fmtMonto(f.comision_total, f.moneda)}</td>
                          <td className="px-4 py-3 text-right">
                            {mayor > 0 ? (
                              <>
                                <div className="text-gray-500 line-through text-xs">{fmtMonto(f.deuda_proveedor + mayor, f.moneda)}</div>
                                <div className="text-xs text-purple-400">−{fmtMonto(mayor, f.moneda)} prem.</div>
                                <div className="text-red-400 font-medium">{fmtMonto(f.deuda_proveedor, f.moneda)}</div>
                              </>
                            ) : (
                              <div className="text-red-400 font-medium">{fmtMonto(f.deuda_proveedor, f.moneda)}</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    {/* Totales USD */}
                    {filasAjustadas.some(f => f.moneda === 'USD') && (
                      <tr className="border-t-2 border-green-800 bg-green-950/30">
                        <td className="px-4 py-3 text-green-400 font-semibold" colSpan={2}>Total USD</td>
                        <td className="px-3 py-3 text-right text-green-300 font-medium">{totalUSD.recibidos}</td>
                        <td className="px-3 py-3 text-right text-green-300 font-medium">{totalUSD.vendidos}</td>
                        <td className="px-3 py-3 text-right text-green-300 font-medium">{totalUSD.recibidos - totalUSD.vendidos}</td>
                        <td colSpan={3} />
                        <td className="px-3 py-3 text-right text-green-300 font-medium">{fmtMonto(totalUSD.ingreso, 'USD')}</td>
                        <td className="px-3 py-3 text-right text-green-400 font-medium">{fmtMonto(totalUSD.comision, 'USD')}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-bold">{fmtMonto(totalUSD.deuda, 'USD')}</td>
                      </tr>
                    )}
                    {/* Totales VES */}
                    {filasAjustadas.some(f => f.moneda === 'VES') && (
                      <tr className="border-t border-blue-800 bg-blue-950/30">
                        <td className="px-4 py-3 text-blue-400 font-semibold" colSpan={2}>Total VES</td>
                        <td className="px-3 py-3 text-right text-blue-300 font-medium">{totalVES.recibidos}</td>
                        <td className="px-3 py-3 text-right text-blue-300 font-medium">{totalVES.vendidos}</td>
                        <td className="px-3 py-3 text-right text-blue-300 font-medium">{totalVES.recibidos - totalVES.vendidos}</td>
                        <td colSpan={3} />
                        <td className="px-3 py-3 text-right text-blue-300 font-medium">{fmtMonto(totalVES.ingreso, 'VES')}</td>
                        <td className="px-3 py-3 text-right text-blue-400 font-medium">{fmtMonto(totalVES.comision, 'VES')}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-bold">{fmtMonto(totalVES.deuda, 'VES')}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Historial ── */}
      {historial.filter(s => s.estado === 'cerrada').length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-300">Historial de semanas</h2>
          <div className="space-y-2">
            {historial.filter(s => s.estado === 'cerrada').map(s => {
              const expanded = semanaExpandida === s.id
              const tieneUSD = s.cierre_recibidos_usd != null
              const tieneVES = s.cierre_recibidos_ves != null
              return (
                <div key={s.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                  {/* Cabecera clickeable */}
                  <button
                    onClick={() => setSemanaExpandida(expanded ? null : s.id)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-800 transition-colors text-left"
                  >
                    <div>
                      <span className="text-white font-medium">
                        {formatFecha(s.fecha_inicio)} – {formatFecha(s.fecha_fin)}
                      </span>
                      {s.notas && (
                        <p className="text-gray-400 text-xs mt-0.5">{s.notas}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-600">CERRADA</span>
                      <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Resumen expandido */}
                  {expanded && (tieneUSD || tieneVES) && (
                    <div className="border-t border-gray-700 px-5 py-4 space-y-4">
                      {tieneUSD && (
                        <div>
                          <p className="text-xs font-semibold text-green-400 mb-2">USD</p>
                          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                            <span className="text-gray-400">Recibidos</span><span className="text-gray-400">Vendidos</span><span className="text-gray-400">Disponibles</span>
                            <span className="text-white font-medium">{s.cierre_recibidos_usd}</span>
                            <span className="text-white font-medium">{s.cierre_vendidos_usd}</span>
                            <span className="text-white font-medium">{(s.cierre_recibidos_usd ?? 0) - (s.cierre_vendidos_usd ?? 0)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
                            <span className="text-gray-400">Ingreso bruto</span><span className="text-white">{fmtMonto(s.cierre_ingreso_usd ?? 0, 'USD')}</span>
                            <span className="text-gray-400">Comisión tienda</span><span className="text-green-400">{fmtMonto(s.cierre_comision_usd ?? 0, 'USD')}</span>
                            <span className="text-gray-400">Premios reembolsados</span><span className="text-purple-400">−{fmtMonto(s.cierre_premios_usd ?? 0, 'USD')}</span>
                            <span className="text-red-300 font-medium">Deuda neta proveedor</span>
                            <span className="text-red-400 font-bold">{fmtMonto(s.cierre_deuda_usd ?? 0, 'USD')}</span>
                          </div>
                        </div>
                      )}
                      {tieneVES && (
                        <div>
                          <p className="text-xs font-semibold text-blue-400 mb-2">VES</p>
                          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
                            <span className="text-gray-400">Recibidos</span><span className="text-gray-400">Vendidos</span><span className="text-gray-400">Disponibles</span>
                            <span className="text-white font-medium">{s.cierre_recibidos_ves}</span>
                            <span className="text-white font-medium">{s.cierre_vendidos_ves}</span>
                            <span className="text-white font-medium">{(s.cierre_recibidos_ves ?? 0) - (s.cierre_vendidos_ves ?? 0)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
                            <span className="text-gray-400">Ingreso bruto</span><span className="text-white">{fmtMonto(s.cierre_ingreso_ves ?? 0, 'VES')}</span>
                            <span className="text-gray-400">Comisión tienda</span><span className="text-green-400">{fmtMonto(s.cierre_comision_ves ?? 0, 'VES')}</span>
                            <span className="text-gray-400">Premios reembolsados</span><span className="text-purple-400">−{fmtMonto(s.cierre_premios_ves ?? 0, 'VES')}</span>
                            <span className="text-red-300 font-medium">Deuda neta proveedor</span>
                            <span className="text-red-400 font-bold">{fmtMonto(s.cierre_deuda_ves ?? 0, 'VES')}</span>
                          </div>
                        </div>
                      )}
                      {!tieneUSD && !tieneVES && (
                        <p className="text-xs text-gray-500">Esta semana fue cerrada antes de que se guardara el resumen.</p>
                      )}
                    </div>
                  )}
                  {expanded && !tieneUSD && !tieneVES && (
                    <div className="border-t border-gray-700 px-5 py-3">
                      <p className="text-xs text-gray-500">Esta semana fue cerrada antes de que se guardara el resumen.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─────────── Modal: Registrar recepción ─────────── */}
      {modalRecepciones && semana && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Registrar recepción de tickets</h2>
              <button onClick={() => setModalRecepciones(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
              <p className="text-gray-400 text-sm">
                Semana: {formatFecha(semana.fecha_inicio)} – {formatFecha(semana.fecha_fin)}
              </p>
              {productos.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay productos en la categoría "Boleteria".</p>
              ) : (
                productos.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <span className="text-white text-sm">{p.nombre}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        p.moneda_precio === 'USD'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-blue-900/50 text-blue-400'
                      }`}>
                        {p.moneda_precio}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={cantidades[p.id] ?? 0}
                      onChange={e => setCantidades(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      className="w-24 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-right focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ))
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => setModalRecepciones(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={guardarRecepciones}
                disabled={guardando || !Object.values(cantidades).some(v => v > 0)}
                className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {guardando ? 'Guardando…' : 'Guardar recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Modal: Arqueo / Cerrar semana ─────────── */}
      {modalArqueo && semana && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Arqueo semanal</h2>
              <button onClick={() => setModalArqueo(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-gray-400 text-sm">
                Semana: {formatFecha(semana.fecha_inicio)} – {formatFecha(semana.fecha_fin)}
              </p>

              {/* Resumen por moneda */}
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-4 py-2 text-gray-400 font-medium"> </th>
                      {filasAjustadas.some(f => f.moneda === 'USD') && (
                        <th className="text-right px-4 py-2 text-green-400 font-medium">USD</th>
                      )}
                      {filasAjustadas.some(f => f.moneda === 'VES') && (
                        <th className="text-right px-4 py-2 text-blue-400 font-medium">VES</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-700/50">
                      <td className="px-4 py-2 text-gray-300">Tickets vendidos</td>
                      {filasAjustadas.some(f => f.moneda === 'USD') && (
                        <td className="px-4 py-2 text-right text-white">{totalUSD.vendidos}</td>
                      )}
                      {filasAjustadas.some(f => f.moneda === 'VES') && (
                        <td className="px-4 py-2 text-right text-white">{totalVES.vendidos}</td>
                      )}
                    </tr>
                    <tr className="border-b border-gray-700/50">
                      <td className="px-4 py-2 text-gray-300">Ingreso bruto</td>
                      {filasAjustadas.some(f => f.moneda === 'USD') && (
                        <td className="px-4 py-2 text-right text-white">{fmtMonto(totalUSD.ingreso, 'USD')}</td>
                      )}
                      {filasAjustadas.some(f => f.moneda === 'VES') && (
                        <td className="px-4 py-2 text-right text-white">{fmtMonto(totalVES.ingreso, 'VES')}</td>
                      )}
                    </tr>
                    <tr className="border-b border-gray-700/50">
                      <td className="px-4 py-2 text-green-300">Comisión tienda</td>
                      {filasAjustadas.some(f => f.moneda === 'USD') && (
                        <td className="px-4 py-2 text-right text-green-400">{fmtMonto(totalUSD.comision, 'USD')}</td>
                      )}
                      {filasAjustadas.some(f => f.moneda === 'VES') && (
                        <td className="px-4 py-2 text-right text-green-400">{fmtMonto(totalVES.comision, 'VES')}</td>
                      )}
                    </tr>
                    <tr className="border-b border-gray-700/50">
                      <td className="px-4 py-2 text-red-300 font-medium">Deuda neta proveedor</td>
                      {filasAjustadas.some(f => f.moneda === 'USD') && (
                        <td className="px-4 py-2 text-right text-red-400 font-medium">{fmtMonto(totalUSD.deuda, 'USD')}</td>
                      )}
                      {filasAjustadas.some(f => f.moneda === 'VES') && (
                        <td className="px-4 py-2 text-right text-red-400 font-medium">{fmtMonto(totalVES.deuda, 'VES')}</td>
                      )}
                    </tr>
                    {premios.length > 0 && (
                      <tr className="border-b border-gray-700/50">
                        <td className="px-4 py-2 text-purple-300 text-xs">
                          Incluye: {premios.filter(p => p.tipo === 'reintegro').length} reintegro(s) y{' '}
                          {premios.filter(p => p.tipo === 'mayor').length} premio(s) mayor(es)
                        </td>
                        {filasAjustadas.some(f => f.moneda === 'USD') && <td />}
                        {filasAjustadas.some(f => f.moneda === 'VES') && <td />}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <textarea
                  value={notasArqueo}
                  onChange={e => setNotasArqueo(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-amber-500"
                  placeholder="Observaciones del arqueo…"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => setModalArqueo(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={cerrarSemana}
                disabled={guardando}
                className="px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium"
              >
                {guardando ? 'Cerrando…' : 'Confirmar y cerrar semana'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Modal: Registrar premio ─────────── */}
      {modalPremio && semana && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Registrar premio pagado</h2>
              <button onClick={() => setModalPremio(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!cajaId && (
                <p className="text-amber-400 text-sm bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2">
                  No tienes una caja abierta. Abre tu caja antes de registrar premios.
                </p>
              )}

              {/* Tipo */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Tipo de premio</label>
                <div className="flex gap-2">
                  {(['reintegro', 'mayor'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setPremioTipo(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        premioTipo === t
                          ? 'bg-purple-700 text-white border-purple-600'
                          : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                      }`}>
                      {t === 'reintegro' ? 'Reintegro' : 'Premio mayor'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Producto (opcional) */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ticket (opcional)</label>
                <select
                  value={premioProdId}
                  onChange={e => {
                    setPremioProdId(e.target.value)
                    if (e.target.value) {
                      const p = productos.find(x => x.id === e.target.value)
                      if (p) {
                        setPremioMoneda(p.moneda_precio)
                        const monto = p.moneda_precio === 'USD' ? p.precio_usd : (p.precio_ves ?? 0)
                        if (premioTipo === 'reintegro') setPremioMonto(monto.toString())
                      }
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">— Sin ticket específico —</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.moneda_precio})</option>
                  ))}
                </select>
              </div>

              {/* Moneda + monto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Moneda</label>
                  <select
                    value={premioMoneda}
                    onChange={e => setPremioMoneda(e.target.value as 'USD' | 'VES')}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="VES">Bolívares (VES)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Monto</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={premioMonto}
                    onChange={e => setPremioMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Fuente de pago */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Fuente de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPremioFuente('caja')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      premioFuente === 'caja'
                        ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}>
                    Efectivo de caja
                  </button>
                  <button onClick={() => setPremioFuente('externo')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      premioFuente === 'externo'
                        ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}>
                    Fondo externo
                  </button>
                </div>
                {premioFuente === 'externo' && (
                  <select value={premioMetodoExterno} onChange={e => setPremioMetodoExterno(e.target.value as 'efectivo' | 'pago_movil')}
                    className="mt-2 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
                    <option value="efectivo">Efectivo</option>
                    <option value="pago_movil">Pago Móvil</option>
                  </select>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <input
                  type="text" value={premioObs} onChange={e => setPremioObs(e.target.value)}
                  placeholder="Ej: ganador en ticket #123"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
              <button onClick={() => setModalPremio(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm">
                Cancelar
              </button>
              <button
                onClick={registrarPremio}
                disabled={guardando || !cajaId || !premioMonto || parseFloat(premioMonto) <= 0}
                className="px-5 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium"
              >
                {guardando ? 'Guardando…' : 'Registrar premio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Modal: Editar premio ─────────── */}
      {editandoPremio && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-amber-700/50 rounded-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Editar premio</h2>
              <button onClick={() => setEditandoPremio(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Tipo de premio</label>
                <div className="flex gap-2">
                  {(['reintegro', 'mayor'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setEditTipo(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        editTipo === t
                          ? 'bg-purple-700 text-white border-purple-600'
                          : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
                      }`}>
                      {t === 'reintegro' ? 'Reintegro' : 'Premio mayor'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Producto (opcional) */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ticket (opcional)</label>
                <select
                  value={editProdId}
                  onChange={e => {
                    setEditProdId(e.target.value)
                    if (e.target.value) {
                      const p = productos.find(x => x.id === e.target.value)
                      if (p) setEditMoneda(p.moneda_precio)
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="">— Sin ticket específico —</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.moneda_precio})</option>
                  ))}
                </select>
              </div>

              {/* Moneda + monto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Moneda</label>
                  <select
                    value={editMoneda}
                    onChange={e => setEditMoneda(e.target.value as 'USD' | 'VES')}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="VES">Bolívares (VES)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Monto</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={editMonto}
                    onChange={e => setEditMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Fuente de pago */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Fuente de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setEditFuente('caja')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      editFuente === 'caja'
                        ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}>
                    Efectivo de caja
                  </button>
                  <button onClick={() => setEditFuente('externo')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      editFuente === 'externo'
                        ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}>
                    Fondo externo
                  </button>
                </div>
                {editFuente === 'externo' && (
                  <select value={editMetodo} onChange={e => setEditMetodo(e.target.value as 'efectivo' | 'pago_movil')}
                    className="mt-2 w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500">
                    <option value="efectivo">Efectivo</option>
                    <option value="pago_movil">Pago Móvil</option>
                  </select>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <input
                  type="text" value={editObs} onChange={e => setEditObs(e.target.value)}
                  placeholder="Ej: ganador en ticket #123"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex gap-3 justify-end">
              <button onClick={() => setEditandoPremio(null)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm">
                Cancelar
              </button>
              <button
                onClick={guardarEdicionPremio}
                disabled={editGuardando || !editMonto || parseFloat(editMonto) <= 0}
                className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {editGuardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Lista de premios de la semana ─── */}
      {semana && premios.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Premios pagados esta semana</h2>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Ticket</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-medium">Fuente</th>
                  <th className="text-right px-4 py-2 text-gray-400 font-medium">Monto</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {premios.map(p => (
                  <tr key={p.id} className="border-b border-gray-800">
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.tipo === 'reintegro'
                          ? 'bg-blue-900/50 text-blue-400 border border-blue-800'
                          : 'bg-purple-900/50 text-purple-400 border border-purple-800'
                      }`}>
                        {p.tipo === 'reintegro' ? 'Reintegro' : 'Premio mayor'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-300 text-xs">
                      {(p.producto as { nombre: string } | null)?.nombre ?? (p.observaciones ?? '—')}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {p.caja?.turno && (
                          <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                            T{p.caja.turno}
                          </span>
                        )}
                        {p.fuente === 'externo' ? (
                          <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-1.5 py-0.5 rounded">
                            Externo{p.metodo_externo === 'pago_movil' ? ' · P.Móvil' : ' · Efectivo'}
                          </span>
                        ) : (
                          <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.5 rounded">
                            Caja
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-purple-300 font-medium">
                      {fmtMonto(p.monto, p.moneda)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => abrirEdicionPremio(p)}
                        className="text-xs text-gray-400 hover:text-white underline mr-2"
                      >
                        Editar
                      </button>
                      {esAdmin && (
                        <button
                          onClick={() => anularPremio(p.id)}
                          className="text-xs text-red-500 hover:text-red-400 underline"
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {totalPremiosUSD > 0 && (
                  <tr className="border-t border-gray-700 bg-gray-800/50">
                    <td colSpan={4} className="px-4 py-2 text-green-400 font-medium text-xs">Total premios USD</td>
                    <td className="px-4 py-2 text-right text-green-400 font-bold">{fmtMonto(totalPremiosUSD, 'USD')}</td>
                    <td />
                  </tr>
                )}
                {totalPremiosVES > 0 && (
                  <tr className="border-t border-gray-700 bg-gray-800/50">
                    <td colSpan={4} className="px-4 py-2 text-blue-400 font-medium text-xs">Total premios VES</td>
                    <td className="px-4 py-2 text-right text-blue-400 font-bold">{fmtMonto(totalPremiosVES, 'VES')}</td>
                    <td />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Historial de premios pagados ── */}
      {historialPremios.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-300">Historial de premios pagados</h2>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800">
                    <th className="text-left px-4 py-2 text-gray-400 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 text-gray-400 font-medium">Tipo</th>
                    <th className="text-left px-4 py-2 text-gray-400 font-medium">Producto</th>
                    <th className="text-left px-4 py-2 text-gray-400 font-medium">Fuente</th>
                    <th className="text-right px-4 py-2 text-gray-400 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {historialPremios.map(p => (
                    <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          p.tipo === 'reintegro'
                            ? 'bg-blue-900/50 text-blue-400 border border-blue-800'
                            : 'bg-purple-900/50 text-purple-400 border border-purple-800'
                        }`}>
                          {p.tipo === 'reintegro' ? 'Reintegro' : 'Premio mayor'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-300 text-xs">
                        {(p.producto as { nombre: string } | null)?.nombre ?? (p.observaciones ?? '—')}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {p.caja?.turno && (
                            <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                              T{p.caja.turno}
                            </span>
                          )}
                          {p.fuente === 'externo' ? (
                            <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-1.5 py-0.5 rounded">
                              Externo{p.metodo_externo === 'pago_movil' ? ' · P.Móvil' : ' · Efectivo'}
                            </span>
                          ) : (
                            <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.5 rounded">
                              Caja
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        <span className={p.moneda === 'USD' ? 'text-green-400' : 'text-blue-400'}>
                          {fmtMonto(p.monto, p.moneda)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Modal: Ver / anular ventas (admin) ─────────── */}
      {modalVentas && semana && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Ventas de tickets — semana actual</h2>
              <button onClick={() => setModalVentas(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
              {ventas.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Sin ventas de tickets en esta semana.</p>
              ) : (
                ventas.map(v => (
                  <div key={v.transaccion_id}
                    className={`border rounded-xl p-4 ${v.anulada ? 'border-gray-700 opacity-50' : 'border-gray-700 bg-gray-800/40'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium">
                            {new Date(v.created_at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-gray-400 text-xs">{v.caja_nombre}</span>
                          {v.usuario_nombre && <span className="text-gray-500 text-xs">· {v.usuario_nombre}</span>}
                          {v.anulada && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-800">ANULADA</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.items.map((it, i) => (
                            <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                              {it.nombre_producto}
                            </span>
                          ))}
                        </div>
                      </div>
                      {!v.anulada && (
                        <button
                          onClick={() => anularVenta(v.transaccion_id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800 text-red-400 border border-red-800 whitespace-nowrap"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setModalVentas(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Modal: Consultar ventas por fecha ─────────── */}
      {modalConsultaVentas && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Ventas de boletería</h2>
              <button onClick={() => setModalConsultaVentas(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {/* Filtros */}
            <div className="px-6 py-4 border-b border-gray-700 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Desde</label>
                <input
                  type="date"
                  value={consultaDesde}
                  onChange={e => setConsultaDesde(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Hasta</label>
                <input
                  type="date"
                  value={consultaHasta}
                  onChange={e => setConsultaHasta(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={consultarVentas}
                disabled={cargandoConsulta || !consultaDesde || !consultaHasta}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
              >
                {cargandoConsulta ? 'Buscando…' : 'Buscar'}
              </button>
            </div>

            {/* Resultados */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {errorConsulta && (
                <p className="text-red-400 text-sm">{errorConsulta}</p>
              )}

              {!cargandoConsulta && ventasConsulta.length === 0 && !errorConsulta && (
                <p className="text-gray-500 text-sm text-center py-8">
                  Selecciona un rango de fechas y presiona Buscar.
                </p>
              )}

              {ventasConsulta.length > 0 && (() => {
                const activas = ventasConsulta.filter(v => !v.anulada)
                const anuladas = ventasConsulta.filter(v => v.anulada)

                // Resumen por producto (usando cantidades ya corregidas por la API)
                const resumenMap = new Map<string, { nombre: string; unidades: number; total_usd: number }>()
                for (const tx of activas) {
                  for (const p of tx.productos) {
                    const prev = resumenMap.get(p.producto_id)
                    resumenMap.set(p.producto_id, {
                      nombre:    p.nombre,
                      unidades:  (prev?.unidades ?? 0) + p.cantidad,
                      total_usd: (prev?.total_usd ?? 0) + p.cantidad * p.precio_usd_unitario,
                    })
                  }
                }
                const resumen = Array.from(resumenMap.values()).sort((a, b) => b.unidades - a.unidades)
                const totalUnidades = resumen.reduce((s, r) => s + r.unidades, 0)
                const totalRecaudado = activas.reduce((s, tx) => s + tx.total_usd, 0)

                return (
                  <>
                    {/* Resumen */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumen</h3>
                      <div className="bg-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left px-4 py-2 text-gray-400 font-medium">Producto</th>
                              <th className="text-right px-4 py-2 text-gray-400 font-medium">Unidades</th>
                              <th className="text-right px-4 py-2 text-gray-400 font-medium">Precio unit.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resumen.map(r => (
                              <tr key={r.nombre} className="border-b border-gray-700/50">
                                <td className="px-4 py-2 text-white">{r.nombre}</td>
                                <td className="px-4 py-2 text-right text-amber-300 font-bold">{r.unidades}</td>
                                <td className="px-4 py-2 text-right text-gray-400">$ {(r.total_usd / r.unidades).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-600 bg-gray-700/30">
                              <td className="px-4 py-2 text-white font-semibold">Total</td>
                              <td className="px-4 py-2 text-right text-amber-300 font-bold">{totalUnidades} uds.</td>
                              <td className="px-4 py-2 text-right text-green-400 font-bold">$ {totalRecaudado.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Detalle por transacción */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Detalle — {activas.length} transacción(es)
                        {anuladas.length > 0 && (
                          <span className="text-red-400 ml-2">· {anuladas.length} anulada(s)</span>
                        )}
                      </h3>
                      <div className="bg-gray-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-700">
                                <th className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">Fecha / Hora</th>
                                <th className="text-left px-3 py-2 text-gray-400 font-medium">Productos</th>
                                <th className="text-left px-3 py-2 text-gray-400 font-medium">Caja</th>
                                <th className="text-center px-3 py-2 text-gray-400 font-medium">Turno</th>
                                <th className="text-left px-3 py-2 text-gray-400 font-medium">Usuario</th>
                                <th className="text-right px-3 py-2 text-gray-400 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ventasConsulta.map((tx, i) => (
                                <tr
                                  key={tx.transaccion_id}
                                  className={`border-b border-gray-700/50 align-top ${tx.anulada ? 'opacity-40' : i % 2 === 0 ? '' : 'bg-gray-800/60'}`}
                                >
                                  <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">
                                    {new Date(tx.created_at).toLocaleString('es-VE', {
                                      day: '2-digit', month: '2-digit', year: '2-digit',
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                    {tx.anulada && <div className="text-red-400 font-medium text-xs">ANULADA</div>}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {tx.productos.map(p => (
                                      <div key={p.producto_id} className="flex items-baseline gap-1.5">
                                        <span className="text-amber-300 font-bold">{p.cantidad}×</span>
                                        <span className="text-white">{p.nombre}</span>
                                        {p.cantidad_inferida && (
                                          <span className="text-gray-500 text-xs" title="Cantidad calculada del total cobrado">*</span>
                                        )}
                                      </div>
                                    ))}
                                  </td>
                                  <td className="px-3 py-2 text-gray-300 text-xs">{tx.caja_nombre}</td>
                                  <td className="px-3 py-2 text-center">
                                    {tx.turno ? (
                                      <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">T{tx.turno}</span>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-gray-300 text-xs">{tx.usuario_nombre}</td>
                                  <td className="px-3 py-2 text-right text-green-400 text-xs font-bold whitespace-nowrap">
                                    $ {tx.total_usd.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {ventasConsulta.some(tx => tx.productos.some(p => p.cantidad_inferida)) && (
                        <p className="text-gray-600 text-xs mt-1">
                          * Cantidad calculada del total cobrado (venta registrada antes de corrección del sistema).
                        </p>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setModalConsultaVentas(false)}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fecha de referencia (solo informativo en dev) */}
      <p className="text-gray-700 text-xs text-right">
        Hoy: {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        {esLunes && ' · Lunes'}{esDomingo && ' · Domingo'}
      </p>

      {/* ─────────── Modal: Arqueo diario por turno ─────────── */}
      {modalArqueoDiario && (() => {
        const TZ = 'America/Caracas'

        // Helper: fecha en VET de un ISO string → 'YYYY-MM-DD'
        function fechaVET(iso: string) {
          return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
        }

        const activas = ventasArqueo.filter(v => !v.anulada)

        // Reintegros del día del arqueo filtrados del historial
        const reintegrosDia = historialPremios.filter(p =>
          p.tipo === 'reintegro' && fechaVET(p.created_at) === arqueoDia
        )

        // Conjunto de todos los productos presentes (ventas + reintegros del día)
        const prodMap = new Map<string, string>() // id → nombre
        for (const tx of activas) {
          for (const p of tx.productos) prodMap.set(p.producto_id, p.nombre)
        }
        for (const p of reintegrosDia) {
          if (p.producto_id && p.producto?.nombre) prodMap.set(p.producto_id, p.producto.nombre)
        }
        // Añadir productos de la semana activa para mostrar disponibilidad aunque no haya ventas hoy
        for (const f of filasAjustadas) prodMap.set(f.producto_id, f.nombre)

        const TURNOS: { key: 1 | 2 | null; label: string; color: string }[] = [
          { key: 1, label: 'T1 — Mañana', color: 'text-amber-400' },
          { key: 2, label: 'T2 — Tarde',  color: 'text-blue-400'  },
        ]

        // Vendidos y reintegros por [producto_id][turno]
        type CeldaTurno = { vendidos: number; reintegros: number }
        const celdas = new Map<string, Map<number | null, CeldaTurno>>()

        for (const tx of activas) {
          const t = tx.turno ?? null
          for (const p of tx.productos) {
            if (!celdas.has(p.producto_id)) celdas.set(p.producto_id, new Map())
            const byTurno = celdas.get(p.producto_id)!
            const prev = byTurno.get(t) ?? { vendidos: 0, reintegros: 0 }
            byTurno.set(t, { ...prev, vendidos: prev.vendidos + p.cantidad })
          }
        }
        for (const p of reintegrosDia) {
          if (!p.producto_id) continue
          const t = p.caja?.turno ?? null
          if (!celdas.has(p.producto_id)) celdas.set(p.producto_id, new Map())
          const byTurno = celdas.get(p.producto_id)!
          const prev = byTurno.get(t) ?? { vendidos: 0, reintegros: 0 }
          byTurno.set(t, { ...prev, reintegros: prev.reintegros + 1 })
        }

        const prodIds = Array.from(prodMap.keys())

        // Totales por turno
        const totalesTurno = new Map<number | null, { vendidos: number; reintegros: number; neto: number }>()
        for (const { key } of TURNOS) {
          let v = 0, r = 0
          for (const pid of prodIds) {
            const c = celdas.get(pid)?.get(key) ?? { vendidos: 0, reintegros: 0 }
            v += c.vendidos; r += c.reintegros
          }
          totalesTurno.set(key, { vendidos: v, reintegros: r, neto: v - r })
        }
        const totalDia = {
          vendidos:   [...totalesTurno.values()].reduce((s, t) => s + t.vendidos,   0),
          reintegros: [...totalesTurno.values()].reduce((s, t) => s + t.reintegros, 0),
          neto:       [...totalesTurno.values()].reduce((s, t) => s + t.neto,       0),
        }

        return (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between shrink-0">
                <h2 className="text-lg font-semibold text-amber-400">Arqueo diario por turno</h2>
                <button onClick={() => setModalArqueoDiario(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>

              {/* Selector de fecha */}
              <div className="px-6 py-3 border-b border-gray-700 flex items-center gap-3 shrink-0">
                <label className="text-xs text-gray-400 font-medium">Fecha</label>
                <input
                  type="date"
                  value={arqueoDia}
                  onChange={e => setArqueoDia(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => cargarArqueo(arqueoDia)}
                  disabled={cargandoArqueo}
                  className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
                >
                  {cargandoArqueo ? 'Cargando…' : 'Actualizar'}
                </button>
                {semana && (
                  <span className="text-xs text-gray-500 ml-auto">
                    Semana: {formatFecha(semana.fecha_inicio)} – {formatFecha(semana.fecha_fin)}
                  </span>
                )}
              </div>

              {/* Cuerpo */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
                {errorArqueo && (
                  <p className="text-red-400 text-sm">{errorArqueo}</p>
                )}
                {cargandoArqueo && (
                  <p className="text-gray-500 text-sm text-center py-10">Cargando…</p>
                )}
                {!cargandoArqueo && !errorArqueo && (
                  <>
                    {/* Grilla principal */}
                    <div className="overflow-x-auto rounded-xl border border-gray-700">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-gray-800 border-b border-gray-700">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs w-40">Producto</th>
                            {TURNOS.map(({ key, label, color }) => (
                              <th key={String(key)} colSpan={3} className={`text-center px-2 py-2.5 text-xs font-semibold ${color} border-l border-gray-700`}>
                                {label}
                              </th>
                            ))}
                            <th colSpan={3} className="text-center px-2 py-2.5 text-xs font-semibold text-gray-300 border-l border-gray-700">
                              Total día
                            </th>
                            {semana && (
                              <th className="text-center px-3 py-2.5 text-xs font-semibold text-purple-400 border-l border-gray-700">
                                Dispon. semana
                              </th>
                            )}
                          </tr>
                          <tr className="bg-gray-800/60 border-b border-gray-700">
                            <th className="text-left px-4 py-1 text-gray-500 text-xs font-normal" />
                            {TURNOS.map(({ key }) => (
                              <th key={String(key) + 'sub'} colSpan={3} className="border-l border-gray-700">
                                <div className="grid grid-cols-3 text-center text-xs text-gray-500 font-normal">
                                  <span className="py-1">Vend.</span>
                                  <span className="py-1 text-purple-500">Reint.</span>
                                  <span className="py-1 text-emerald-500">Neto</span>
                                </div>
                              </th>
                            ))}
                            <th colSpan={3} className="border-l border-gray-700">
                              <div className="grid grid-cols-3 text-center text-xs text-gray-500 font-normal">
                                <span className="py-1">Vend.</span>
                                <span className="py-1 text-purple-500">Reint.</span>
                                <span className="py-1 text-emerald-500">Neto</span>
                              </div>
                            </th>
                            {semana && <th className="border-l border-gray-700 py-1 text-xs text-gray-500 font-normal text-center">Disponibles</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/60">
                          {prodIds.length === 0 && (
                            <tr>
                              <td colSpan={semana ? 11 : 10} className="text-center py-8 text-gray-500 text-sm">
                                Sin ventas ni reintegros para esta fecha.
                              </td>
                            </tr>
                          )}
                          {prodIds.map(pid => {
                            const nombre = prodMap.get(pid)!
                            const totalVend = TURNOS.reduce((s, { key }) => s + (celdas.get(pid)?.get(key)?.vendidos ?? 0), 0)
                            const totalRei  = TURNOS.reduce((s, { key }) => s + (celdas.get(pid)?.get(key)?.reintegros ?? 0), 0)
                            const totalNeto = totalVend - totalRei
                            const fila = filasAjustadas.find(f => f.producto_id === pid)
                            return (
                              <tr key={pid} className="hover:bg-gray-800/40">
                                <td className="px-4 py-2.5 text-white text-xs font-medium">{nombre}</td>
                                {TURNOS.map(({ key }) => {
                                  const c = celdas.get(pid)?.get(key) ?? { vendidos: 0, reintegros: 0 }
                                  const neto = c.vendidos - c.reintegros
                                  return (
                                    <td key={String(key)} colSpan={3} className="border-l border-gray-700 px-0">
                                      <div className="grid grid-cols-3 text-center text-xs">
                                        <span className={`py-2 ${c.vendidos > 0 ? 'text-white font-medium' : 'text-gray-600'}`}>
                                          {c.vendidos || '—'}
                                        </span>
                                        <span className={`py-2 ${c.reintegros > 0 ? 'text-purple-400 font-medium' : 'text-gray-600'}`}>
                                          {c.reintegros > 0 ? `−${c.reintegros}` : '—'}
                                        </span>
                                        <span className={`py-2 font-bold ${neto > 0 ? 'text-emerald-400' : neto < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                          {c.vendidos === 0 && c.reintegros === 0 ? '—' : neto}
                                        </span>
                                      </div>
                                    </td>
                                  )
                                })}
                                {/* Total día */}
                                <td colSpan={3} className="border-l border-gray-700 px-0">
                                  <div className="grid grid-cols-3 text-center text-xs">
                                    <span className={`py-2 ${totalVend > 0 ? 'text-white font-medium' : 'text-gray-600'}`}>{totalVend || '—'}</span>
                                    <span className={`py-2 ${totalRei > 0 ? 'text-purple-400 font-medium' : 'text-gray-600'}`}>{totalRei > 0 ? `−${totalRei}` : '—'}</span>
                                    <span className={`py-2 font-bold ${totalNeto > 0 ? 'text-emerald-400' : totalNeto < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                      {totalVend === 0 && totalRei === 0 ? '—' : totalNeto}
                                    </span>
                                  </div>
                                </td>
                                {/* Disponibilidad semana */}
                                {semana && (
                                  <td className="border-l border-gray-700 text-center py-2 text-xs">
                                    {fila
                                      ? <span className={`font-bold ${fila.disponibles <= 0 ? 'text-red-400' : fila.disponibles <= 5 ? 'text-amber-400' : 'text-purple-300'}`}>
                                          {fila.disponibles}
                                        </span>
                                      : <span className="text-gray-600">—</span>
                                    }
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot className="bg-gray-800/80 border-t-2 border-gray-600">
                          <tr>
                            <td className="px-4 py-2.5 text-xs font-semibold text-gray-300">Total</td>
                            {TURNOS.map(({ key }) => {
                              const tt = totalesTurno.get(key) ?? { vendidos: 0, reintegros: 0, neto: 0 }
                              return (
                                <td key={String(key)} colSpan={3} className="border-l border-gray-700 px-0">
                                  <div className="grid grid-cols-3 text-center text-xs">
                                    <span className="py-2.5 text-white font-bold">{tt.vendidos || '—'}</span>
                                    <span className="py-2.5 text-purple-400 font-bold">{tt.reintegros > 0 ? `−${tt.reintegros}` : '—'}</span>
                                    <span className="py-2.5 text-emerald-400 font-bold">{tt.neto || '—'}</span>
                                  </div>
                                </td>
                              )
                            })}
                            <td colSpan={3} className="border-l border-gray-700 px-0">
                              <div className="grid grid-cols-3 text-center text-xs">
                                <span className="py-2.5 text-white font-bold">{totalDia.vendidos || '—'}</span>
                                <span className="py-2.5 text-purple-400 font-bold">{totalDia.reintegros > 0 ? `−${totalDia.reintegros}` : '—'}</span>
                                <span className="py-2.5 text-emerald-400 font-bold">{totalDia.neto || '—'}</span>
                              </div>
                            </td>
                            {semana && <td className="border-l border-gray-700" />}
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Leyenda */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      <span><span className="text-white font-medium">Vend.</span> = tickets vendidos en el turno</span>
                      <span><span className="text-purple-400 font-medium">Reint.</span> = reintegros registrados en el turno</span>
                      <span><span className="text-emerald-400 font-medium">Neto</span> = vendidos − reintegros</span>
                      {semana && <span><span className="text-purple-300 font-medium">Dispon. semana</span> = stock disponible acumulado</span>}
                    </div>

                    {/* Detalle de turnos: quién operó */}
                    {activas.length > 0 && (() => {
                      const cajerosPorTurno = new Map<number | null, Set<string>>()
                      for (const tx of activas) {
                        const t = tx.turno ?? null
                        if (!cajerosPorTurno.has(t)) cajerosPorTurno.set(t, new Set())
                        cajerosPorTurno.get(t)!.add(`${tx.usuario_nombre} (${tx.caja_nombre})`)
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {TURNOS.map(({ key, label, color }) => {
                            const cajeros = cajerosPorTurno.get(key)
                            if (!cajeros?.size) return null
                            const txsTurno = activas.filter(v => v.turno === key)
                            return (
                              <div key={String(key)} className="bg-gray-800 border border-gray-700 rounded-xl p-3 space-y-1">
                                <p className={`text-xs font-semibold ${color}`}>{label}</p>
                                <p className="text-xs text-gray-400">{txsTurno.length} transacción(es)</p>
                                {Array.from(cajeros).map(c => (
                                  <p key={c} className="text-xs text-gray-300">{c}</p>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-700 flex justify-end shrink-0">
                <button
                  onClick={() => setModalArqueoDiario(false)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Fecha de referencia (solo informativo en dev) */}
      <p className="text-gray-700 text-xs text-right">
        Hoy: {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        {esLunes && ' · Lunes'}{esDomingo && ' · Domingo'}
      </p>
    </div>
  )
}
