'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Producto, TasaCambio, ItemCarrito, MetodoPago, Categoria, Caja, SistemaInventario } from '@/types'
import { RateBar } from '@/components/shared/RateBar'
import { MethodBadge } from '@/components/shared/MethodBadge'
import { calcularPrecioItem, requiereReferencia, esBiopago } from '@/lib/utils/commission'
import { formatUSD, formatVES, usdToVes } from '@/lib/utils/currency'

const METODOS_VES: MetodoPago[] = ['efectivo_ves', 'pago_movil', 'transferencia_ves', 'banesco_pos', 'biopago']
const METODOS_USD: MetodoPago[] = ['efectivo_usd', 'zelle', 'binance', 'billetera_digital_usd', 'vale']

type EntradaPago = { id: string; metodo: MetodoPago; monto: string; referencia: string }
const ENTRADA_INICIAL: EntradaPago[] = [{ id: '1', metodo: 'efectivo_ves', monto: '', referencia: '' }]

const LABEL: Record<MetodoPago, string> = {
  efectivo_ves: 'Efectivo Bs.',
  pago_movil: 'Pago Móvil',
  transferencia_ves: 'Transferencia',
  banesco_pos: 'POS Banesco',
  biopago: 'Biopago',
  efectivo_usd: 'Efectivo USD',
  zelle: 'Zelle',
  binance: 'Binance',
  billetera_digital_usd: 'Billetera Digital USD',
  vale: 'Vale',
}

const inputCls = "w-full bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
const selectCls = "w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"

export default function POSPage() {
  const [tasa, setTasa] = useState<TasaCambio | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [caja, setCaja] = useState<Caja | null>(null)
  const cajaId = caja?.id ?? null
  const [categoriasColapsadas, setCategoriasColapsadas] = useState<Set<string>>(new Set())

  const toggleCategoria = useCallback((id: string) => {
    setCategoriasColapsadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // Entradas de pago múltiple
  const [entradasPago, setEntradasPago] = useState<EntradaPago[]>(ENTRADA_INICIAL)

  // Moneda de entrada para productos de monto variable (por producto_id)
  const [monedaVariableMap, setMonedaVariableMap] = useState<Record<string, 'USD' | 'VES'>>({})
  const [valorVariableRaw, setValorVariableRaw] = useState<Record<string, string>>({})

  // ── Modal premios Lotería ──
  const [modalPosLoteria, setModalPosLoteria] = useState(false)
  const [posLotProds, setPosLotProds] = useState<{ producto_id: string; nombre: string }[]>([])
  const [posLotProdId, setPosLotProdId] = useState('')
  const [posLotTicket, setPosLotTicket] = useState('')
  const [posLotMoneda, setPosLotMoneda] = useState<'USD' | 'VES'>('VES')
  const [posLotMonto, setPosLotMonto] = useState('')
  const [posLotFuente, setPosLotFuente] = useState<'caja' | 'externo'>('caja')
  const [posLotMetodo, setPosLotMetodo] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [posLotObs, setPosLotObs] = useState('')
  const [posLotGuardando, setPosLotGuardando] = useState(false)

  // ── Modal selección sistema de recarga ──
  const [modalSistemaRecarga, setModalSistemaRecarga] = useState(false)
  const [sistemaOverrides, setSistemaOverrides] = useState<Record<string, string>>({})

  // ── Modal premios Tickets semanales ──
  const [modalPosTickets, setModalPosTickets] = useState(false)
  const [posTkSemanaId, setPosTkSemanaId] = useState<string | null>(null)
  const [posTkProds, setPosTkProds] = useState<{ id: string; nombre: string; moneda_precio: 'USD' | 'VES'; precio_usd: number; precio_ves: number | null }[]>([])
  const [posTkTipo, setPosTkTipo] = useState<'reintegro' | 'mayor'>('reintegro')
  const [posTkProdId, setPosTkProdId] = useState('')
  const [posTkMoneda, setPosTkMoneda] = useState<'USD' | 'VES'>('VES')
  const [posTkMonto, setPosTkMonto] = useState('')
  const [posTkFuente, setPosTkFuente] = useState<'caja' | 'externo'>('caja')
  const [posTkMetodo, setPosTkMetodo] = useState<'efectivo' | 'pago_movil'>('efectivo')
  const [posTkObs, setPosTkObs] = useState('')
  const [posTkGuardando, setPosTkGuardando] = useState(false)

  useEffect(() => { cargarTasa(); cargarProductos(); cargarCaja() }, [])

  async function cargarTasa() {
    const res = await fetch('/api/tasa/vigente')
    if (res.ok) setTasa(await res.json())
  }

  async function cargarCaja() {
    const res = await fetch('/api/cajas')
    if (res.ok) {
      const data = await res.json()
      setCaja(data ?? null)
    }
  }

  async function fetchTasaBCV() {
    const res = await fetch('/api/tasa/fetch-bcv', { method: 'POST' })
    if (res.ok) cargarTasa()
    else setMensaje('No se pudo obtener la tasa. Ingrese manualmente.')
  }

  async function cargarProductos() {
    const res = await fetch('/api/productos?activo=true')
    if (res.ok) setProductos(await res.json())
  }

  function agregarAlCarrito(producto: Producto) {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.producto.id === producto.id)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { producto, cantidad: 1 }]
    })
  }

  function cambiarCantidad(productoId: string, delta: number) {
    setCarrito(prev => prev
      .map(i => i.producto.id === productoId ? { ...i, cantidad: i.cantidad + delta } : i)
      .filter(i => i.cantidad > 0)
    )
  }

  function actualizarMontoLibre(productoId: string, raw: string, moneda: 'USD' | 'VES') {
    setValorVariableRaw(prev => ({ ...prev, [productoId]: raw }))
    const valor = parseFloat(raw)
    const valido = !isNaN(valor) && valor > 0
    setCarrito(prev => prev.map(i =>
      i.producto.id === productoId
        ? {
            ...i,
            monto_libre_usd: moneda === 'USD' && valido ? valor : undefined,
            monto_libre_ves: moneda === 'VES' && valido ? valor : undefined,
          }
        : i
    ))
  }

  function cambiarMonedaVariable(productoId: string, nuevaMoneda: 'USD' | 'VES') {
    const monedaActual = monedaVariableMap[productoId] ?? 'USD'
    if (monedaActual === nuevaMoneda) return
    const raw = valorVariableRaw[productoId] ?? ''
    const valor = parseFloat(raw)
    if (!isNaN(valor) && valor > 0 && tasaValor > 0) {
      const convertido = nuevaMoneda === 'VES'
        ? (valor * tasaValor).toFixed(2)
        : (valor / tasaValor).toFixed(6)
      setValorVariableRaw(prev => ({ ...prev, [productoId]: convertido }))
    }
    setMonedaVariableMap(prev => ({ ...prev, [productoId]: nuevaMoneda }))
  }

  const tasaValor = tasa?.tasa ?? 0

  const metodoParaCalculo = entradasPago[0]?.metodo ?? 'efectivo_ves'
  const resumen = carrito.reduce(
    (acc, item) => {
      const calc = calcularPrecioItem(item.producto, metodoParaCalculo, tasaValor, item.monto_libre_usd, item.monto_libre_ves)
      const qty = item.cantidad
      return {
        comision_usd: acc.comision_usd + calc.comision * qty,
        total_usd: acc.total_usd + calc.precio_usd * qty,
      }
    },
    { comision_usd: 0, total_usd: 0 }
  )

  // Totales de pago acumulado
  const totalPagadoUsd = entradasPago.reduce((sum, e) => {
    const m = parseFloat(e.monto) || 0
    if (!m) return sum
    return sum + (METODOS_VES.includes(e.metodo) ? m / tasaValor : m)
  }, 0)
  const faltanteUsd = Math.max(0, resumen.total_usd - totalPagadoUsd)
  const excedentUsd = Math.max(0, totalPagadoUsd - resumen.total_usd)
  const pagoCompleto = faltanteUsd < 0.001

  // Helpers para gestionar entradas
  function agregarEntrada() {
    const faltanteVes = faltanteUsd * tasaValor
    setEntradasPago(prev => [...prev, {
      id: Date.now().toString(),
      metodo: 'efectivo_ves',
      monto: faltanteVes > 0 ? faltanteVes.toFixed(2) : '',
      referencia: '',
    }])
  }

  function actualizarEntrada(id: string, campo: keyof EntradaPago, valor: string) {
    setEntradasPago(prev => prev.map(e => e.id === id ? { ...e, [campo]: valor } : e))
  }

  function actualizarMetodoEntrada(id: string, nuevoMetodo: MetodoPago) {
    setEntradasPago(prev => prev.map(e => {
      if (e.id !== id) return e
      const esVesAntes = METODOS_VES.includes(e.metodo)
      const esVesNuevo = METODOS_VES.includes(nuevoMetodo)
      const montoActual = parseFloat(e.monto) || 0
      let nuevoMonto = e.monto
      if (montoActual > 0 && esVesAntes !== esVesNuevo && tasaValor > 0) {
        nuevoMonto = esVesNuevo
          ? (montoActual * tasaValor).toFixed(2)
          : (montoActual / tasaValor).toFixed(6)
      }
      return { ...e, metodo: nuevoMetodo, monto: nuevoMonto }
    }))
  }

  function eliminarEntrada(id: string) {
    setEntradasPago(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev)
  }

  function limpiarPago() {
    setEntradasPago(ENTRADA_INICIAL)
  }

  async function procesarPago() {
    if (!carrito.length || !tasa) return
    setProcesando(true)

    // Expandir por cantidad: cada unidad genera su propia fila en items_transaccion
    // Esto garantiza que el cuadre de boletería/lotería cuente unidades correctamente
    const items = carrito.flatMap(item => {
      const calc = calcularPrecioItem(item.producto, metodoParaCalculo, tasaValor, item.monto_libre_usd, item.monto_libre_ves)
      const costoUsd = (() => {
        if (item.producto.monto_variable) {
          const vesAmt = item.monto_libre_ves ?? (item.monto_libre_usd ? item.monto_libre_usd * tasaValor : 0)
          const pct = item.producto.comision_pct ?? 0
          if (vesAmt > 0 && pct > 0 && tasaValor > 0) return (vesAmt * (1 - pct / 100)) / tasaValor
          return tasaValor > 0 ? vesAmt / tasaValor : 0
        }
        return item.producto.moneda_precio === 'VES'
          ? (item.producto.costo_ves ?? 0) / tasaValor
          : item.producto.costo_usd
      })()
      const comisionDefinidaUsd = item.producto.moneda_precio === 'VES'
        ? (item.producto.comision_ves ?? 0) / tasaValor
        : item.producto.comision_usd
      // Consumo de inventario por unidad
      const sis = item.producto.sistema
      let consumo_unit: number | undefined
      if (sis && item.producto.sistema_id) {
        if (sis.tipo === 'unidades') {
          consumo_unit = 1
        } else {
          if (item.producto.monto_variable) {
            const vesAmt = item.monto_libre_ves ?? (item.monto_libre_usd ? item.monto_libre_usd * tasaValor : 0)
            consumo_unit = vesAmt
          } else if (item.producto.moneda_precio === 'VES') {
            consumo_unit = item.producto.costo_ves ?? 0
          } else {
            consumo_unit = item.producto.costo_usd * tasaValor
          }
        }
      }

      const efectivoSisId = sistemaOverrides[item.producto.id] ?? item.producto.sistema_id ?? null
      const efectivoSis   = efectivoSisId
        ? (sistemasDisponibles.find(s => s.id === efectivoSisId) ?? sis)
        : sis

      return Array.from({ length: item.cantidad }, () => ({
        producto_id: item.producto.id,
        nombre_producto: item.producto.nombre,
        costo_usd: costoUsd,
        precio_usd: calc.precio_usd,
        comision_cobrada: calc.comision,
        comision_definida: comisionDefinidaUsd,
        monto_libre_usd: item.monto_libre_usd ?? null,
        sistema_id: efectivoSisId,
        sistema_tipo: efectivoSis?.tipo ?? null,
        consumo_inventario: consumo_unit ?? null,
      }))
    })

    const pagos = entradasPago
      .filter(e => (parseFloat(e.monto) || 0) > 0)
      .map(e => ({
        metodo: e.metodo,
        moneda: METODOS_VES.includes(e.metodo) ? 'VES' : 'USD',
        monto: parseFloat(e.monto),
        referencia: e.referencia || null,
      }))

    const res = await fetch('/api/transacciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caja_id: cajaId, items, pagos, tasa_aplicada: tasaValor }),
    })

    if (res.ok) {
      setCarrito([])
      setSistemaOverrides({})
      limpiarPago()
      setMensaje('✓ Venta procesada correctamente')
      setTimeout(() => setMensaje(''), 3000)
    } else {
      setMensaje('Error al procesar la venta')
    }
    setProcesando(false)
  }

  // Agrupar productos por categoría
  const productosFiltrados = productos.filter(p =>
    !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const categorias = Array.from(
    new Map(productosFiltrados.map(p => [p.categoria_id, p.categoria as Categoria] as [string, Categoria]).filter(([, c]) => c)).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre))

  const productosPorCategoria = (catId: string) =>
    productosFiltrados.filter(p => p.categoria_id === catId)

  const variablesSinMonto = carrito.some(i =>
    i.producto.monto_variable &&
    !(i.monto_libre_usd && i.monto_libre_usd > 0) &&
    !(i.monto_libre_ves && i.monto_libre_ves > 0)
  )

  // Calcula consumo de inventario por sistema para los ítems del carrito
  function calcularConsumoPorSistema(): Map<string, { nombre: string; tipo: string; requerido: number }> {
    const mapa = new Map<string, { nombre: string; tipo: string; requerido: number }>()
    for (const item of carrito) {
      const sis = item.producto.sistema
      if (!sis || !item.producto.sistema_id) continue
      let consumo = 0
      if (sis.tipo === 'unidades') {
        consumo = item.cantidad
      } else {
        // saldo_ves: descuenta el costo (monto enviado al sistema externo)
        if (item.producto.monto_variable) {
          const vesAmt = item.monto_libre_ves ?? (item.monto_libre_usd ? item.monto_libre_usd * tasaValor : 0)
          consumo = vesAmt * item.cantidad
        } else if (item.producto.moneda_precio === 'VES') {
          consumo = (item.producto.costo_ves ?? 0) * item.cantidad
        } else {
          consumo = item.producto.costo_usd * tasaValor * item.cantidad
        }
      }
      if (consumo <= 0) continue
      const prev = mapa.get(item.producto.sistema_id)
      mapa.set(item.producto.sistema_id, {
        nombre: sis.nombre,
        tipo: sis.tipo,
        requerido: (prev?.requerido ?? 0) + consumo,
      })
    }
    return mapa
  }

  const consumoPorSistema = calcularConsumoPorSistema()

  // Advertencias de saldo insuficiente según turno de la caja
  const alertasInventario: string[] = []
  for (const item of carrito) {
    const sis = item.producto.sistema
    if (!sis || !item.producto.sistema_id) continue
    if (sis.tipo === 'contador') continue
    const saldoDisponible = caja?.turno === 2 ? sis.saldo_turno_2 : sis.saldo_turno_1
    const consumo = consumoPorSistema.get(item.producto.sistema_id)
    if (consumo && saldoDisponible < consumo.requerido) {
      const label = sis.tipo === 'unidades'
        ? `${Math.floor(saldoDisponible)} uds. disponibles`
        : `${formatVES(saldoDisponible)} disponibles`
      if (!alertasInventario.some(a => a.includes(sis.nombre))) {
        alertasInventario.push(`${sis.nombre}: ${label}`)
      }
    }
  }

  // Pre-llenar primer método de pago con el total del carrito al agregar/quitar items
  useEffect(() => {
    if (carrito.length === 0 || tasaValor === 0) return
    setEntradasPago(prev => {
      if (prev.length > 1) return prev // modo mixto: no sobreescribir
      const metodo = prev[0]?.metodo ?? 'efectivo_ves'
      const esVes = METODOS_VES.includes(metodo)
      const monto = esVes
        ? (resumen.total_usd * tasaValor).toFixed(2)
        : resumen.total_usd.toFixed(2)
      if (prev[0]?.monto === monto) return prev
      return [{ ...prev[0], monto }]
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito, tasaValor, resumen.total_usd])

  const puedeConfirmar = carrito.length > 0 && !!tasa && !!cajaId && !variablesSinMonto && pagoCompleto

  // Sistemas únicos derivados de productos de la categoría RECARGAS (para el selector de override)
  const sistemasDisponibles = useMemo(() => {
    const map = new Map<string, SistemaInventario>()
    for (const p of productos) {
      if (
        p.sistema_id &&
        p.sistema &&
        p.sistema.tipo !== 'unidades' &&
        p.categoria?.nombre?.toLowerCase() === 'recarga'
      ) {
        map.set(p.sistema_id, p.sistema)
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [productos])

  // Items del carrito de categoría RECARGAS que requieren selección de sistema compartido
  // LOTERIA y BOLETERIA tienen sistema propio por producto y no requieren confirmación
  const itemsRecarga = carrito.filter(
    i =>
      i.producto.sistema_id &&
      i.producto.sistema?.tipo !== 'unidades' &&
      i.producto.categoria?.nombre?.toLowerCase() === 'recarga'
  )

  // Consumo estimado en Bs. por item (para mostrar en el modal)
  function consumoEstimadoItem(item: ItemCarrito): number {
    const sis = item.producto.sistema
    if (!sis) return 0
    if (item.producto.monto_variable) {
      const vesAmt = item.monto_libre_ves ?? (item.monto_libre_usd ? item.monto_libre_usd * tasaValor : 0)
      return vesAmt * item.cantidad
    }
    if (item.producto.moneda_precio === 'VES') return (item.producto.costo_ves ?? 0) * item.cantidad
    return item.producto.costo_usd * tasaValor * item.cantidad
  }

  function abrirModalSistema() {
    const defaults: Record<string, string> = {}
    for (const item of itemsRecarga) {
      if (item.producto.sistema_id) defaults[item.producto.id] = item.producto.sistema_id
    }
    setSistemaOverrides(defaults)
    setModalSistemaRecarga(true)
  }

  async function abrirModalLoteria() {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
    const r = await fetch(`/api/loteria/resumen?desde=${hoy}&hasta=${hoy}`)
    const data = await r.json()
    setPosLotProds(data.filas ?? [])
    setPosLotProdId(''); setPosLotTicket(''); setPosLotMoneda('VES')
    setPosLotMonto(''); setPosLotFuente('caja'); setPosLotMetodo('efectivo'); setPosLotObs('')
    setModalPosLoteria(true)
  }

  async function registrarPremioLoteria() {
    if (!cajaId || !posLotProdId || !posLotTicket.trim() || !posLotMonto || parseFloat(posLotMonto) <= 0) return
    setPosLotGuardando(true)
    try {
      await fetch('/api/loteria/premios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caja_id: cajaId, producto_id: posLotProdId, numero_ticket: posLotTicket.trim(),
          moneda: posLotMoneda, monto: parseFloat(posLotMonto),
          observaciones: posLotObs || null, fuente: posLotFuente,
          metodo_externo: posLotFuente === 'externo' ? posLotMetodo : null,
        }),
      })
      setModalPosLoteria(false)
    } finally { setPosLotGuardando(false) }
  }

  async function abrirModalTickets() {
    const [rSemana, rProds] = await Promise.all([
      fetch('/api/boleteria/semana-actual').then(r => r.json()),
      fetch('/api/productos?activo=true').then(r => r.json()),
    ])
    setPosTkSemanaId(rSemana.semana?.id ?? null)
    const ticketProds = (Array.isArray(rProds) ? rProds : []).filter(
      (p: { categoria?: { nombre: string } }) => p.categoria?.nombre === 'Boleteria'
    )
    setPosTkProds(ticketProds)
    setPosTkTipo('reintegro'); setPosTkProdId(''); setPosTkMoneda('VES')
    setPosTkMonto(''); setPosTkFuente('caja'); setPosTkMetodo('efectivo'); setPosTkObs('')
    setModalPosTickets(true)
  }

  async function registrarPremioTickets() {
    if (!cajaId || !posTkSemanaId || !posTkMonto || parseFloat(posTkMonto) <= 0) return
    setPosTkGuardando(true)
    try {
      await fetch(`/api/boleteria/semanas/${posTkSemanaId}/premios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caja_id: cajaId, producto_id: posTkProdId || null,
          tipo: posTkTipo, moneda: posTkMoneda, monto: parseFloat(posTkMonto),
          observaciones: posTkObs || null, fuente: posTkFuente,
          metodo_externo: posTkFuente === 'externo' ? posTkMetodo : null,
        }),
      })
      setModalPosTickets(false)
    } finally { setPosTkGuardando(false) }
  }

  return (
    <>
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Columna izquierda — Productos */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra superior */}
        <div className="px-3 pt-3 pb-2 space-y-2 bg-gray-900 border-b border-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <RateBar tasa={tasa} onCargarTasa={fetchTasaBCV} />
            <button onClick={abrirModalLoteria}
              className="shrink-0 bg-purple-800 hover:bg-purple-700 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition-colors">
              Premio Lotería
            </button>
            <button onClick={abrirModalTickets}
              className="shrink-0 bg-indigo-800 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-xs font-medium transition-colors">
              Premios Boletería
            </button>
            {caja?.turno && (
              <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                caja.turno === 1
                  ? 'bg-amber-900/50 text-amber-400 border border-amber-700'
                  : 'bg-blue-900/50 text-blue-400 border border-blue-700'
              }`}>
                {caja.turno === 1 ? 'T1' : 'T2'}
              </span>
            )}
          </div>
          {mensaje && (
            <div className={`rounded-lg px-3 py-1.5 text-xs border ${mensaje.startsWith('✓') ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' : 'bg-red-900/40 border-red-700 text-red-300'}`}>
              {mensaje}
            </div>
          )}
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Grid de productos agrupados por categoría */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {categorias.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-12">Sin productos activos</p>
          )}
          {categorias.map(cat => {
            const colapsada = categoriasColapsadas.has(cat.id)
            return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategoria(cat.id)}
                className="w-full flex items-center gap-2 mb-2 group"
              >
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide capitalize">
                  {cat.nombre}
                </span>
                <div className="flex-1 h-px bg-gray-700" />
                <svg
                  className={`w-3.5 h-3.5 text-gray-500 group-hover:text-amber-400 transition-transform duration-200 shrink-0 ${colapsada ? '-rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {!colapsada && <div className="flex flex-wrap gap-2">
                {productosPorCategoria(cat.id).map(producto => {
                  const calc = calcularPrecioItem(producto, metodoParaCalculo, tasaValor)
                  const enCarrito = carrito.find(i => i.producto.id === producto.id)
                  const precio = METODOS_VES.includes(metodoParaCalculo)
                    ? formatVES(usdToVes(calc.precio_usd, tasaValor))
                    : formatUSD(calc.precio_usd)
                  return (
                    <button
                      key={producto.id}
                      onClick={() => agregarAlCarrito(producto)}
                      className={`relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl border transition-all hover:shadow-md active:scale-95 ${
                        enCarrito
                          ? 'border-emerald-500 bg-emerald-900/20 shadow-sm'
                          : 'border-gray-700 bg-gray-800 hover:border-emerald-600'
                      }`}
                      style={{ minWidth: 0 }}
                    >
                      {producto.imagen_url ? (
                        <img
                          src={producto.imagen_url}
                          alt={producto.nombre}
                          className="w-12 h-12 object-cover rounded-lg shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg shrink-0 bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-gray-300 font-bold text-lg">
                          {producto.nombre[0].toUpperCase()}
                        </div>
                      )}
                      <div className="text-left min-w-0">
                        <p className="text-xs font-semibold text-gray-100 leading-tight max-w-[90px] truncate">
                          {producto.nombre}
                        </p>
                        <p className={`text-xs font-bold mt-0.5 ${enCarrito ? 'text-emerald-400' : 'text-emerald-500'}`}>
                          {precio}
                        </p>
                      </div>
                      {enCarrito && (
                        <span className="absolute -top-2 -right-2 bg-emerald-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow">
                          {enCarrito.cantidad}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>}
            </div>
          )})}
        </div>
      </div>

      {/* Columna derecha — Carrito */}
      <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-100 text-sm">Carrito</h2>
          {carrito.length > 0 && (
            <button onClick={() => setCarrito([])} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Vaciar
            </button>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {carrito.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-8">Sin productos</p>
          )}
          {carrito.map(item => {
            const calc = calcularPrecioItem(item.producto, metodoParaCalculo, tasaValor, item.monto_libre_usd, item.monto_libre_ves)
            const esVariable = item.producto.monto_variable
            const montoDefinido = esVariable
              ? (item.monto_libre_ves ?? 0) > 0
              : true
            const precioLinea = METODOS_VES.includes(metodoParaCalculo)
              ? formatVES(usdToVes(calc.precio_usd * item.cantidad, tasaValor))
              : formatUSD(calc.precio_usd * item.cantidad)
            return (
              <div key={item.producto.id} className="py-1.5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-100 truncate">{item.producto.nombre}</p>
                    {esVariable ? (
                      <div className="mt-1 space-y-1">
                        {/* Input de monto en Bs. */}
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Monto Bs."
                            value={valorVariableRaw[item.producto.id] ?? ''}
                            onChange={e => actualizarMontoLibre(item.producto.id, e.target.value, 'VES')}
                            className={`w-full rounded px-2 py-1 pr-8 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                              !montoDefinido
                                ? 'border border-orange-500 bg-orange-900/20'
                                : 'border border-gray-600 bg-gray-800'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">Bs.</span>
                        </div>
                        {!montoDefinido && (
                          <p className="text-xs text-orange-400 font-medium">Ingresa el monto</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-400 font-semibold">{precioLinea}</p>
                    )}
                    {esVariable && montoDefinido && (
                      <p className="text-xs text-emerald-400 font-semibold mt-0.5">{precioLinea}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => cambiarCantidad(item.producto.id, -1)}
                      className="w-5 h-5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-xs flex items-center justify-center transition-colors"
                    >−</button>
                    <span className="text-xs font-medium w-4 text-center text-gray-100">{item.cantidad}</span>
                    <button
                      onClick={() => cambiarCantidad(item.producto.id, 1)}
                      className="w-5 h-5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-xs flex items-center justify-center transition-colors"
                    >+</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Totales y pago */}
        <div className="border-t border-gray-700 px-3 py-3 space-y-2.5">

          {/* Total factura */}
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-300">Total</span>
            <div className="text-right">
              <p className="text-base font-bold text-gray-100">{formatVES(resumen.total_usd * tasaValor)}</p>
              <p className="text-xs text-gray-500">{formatUSD(resumen.total_usd)}</p>
            </div>
          </div>

          {/* ─── ENTRADAS DE PAGO ─── */}
          <div className="space-y-2">
            {entradasPago.map((entrada, idx) => {
              const esVes = METODOS_VES.includes(entrada.metodo)
              const monedaLabel = esVes ? 'Bs.' : 'USD'
              return (
                <div key={entrada.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-semibold shrink-0">#{idx + 1}</span>
                    <select
                      value={entrada.metodo}
                      onChange={e => actualizarMetodoEntrada(entrada.id, e.target.value as MetodoPago)}
                      className={selectCls}
                    >
                      <optgroup label="Bolívares (con comisión)">
                        {METODOS_VES.map(m => <option key={m} value={m}>{LABEL[m]}</option>)}
                      </optgroup>
                      <optgroup label="Divisas (sin comisión)">
                        {METODOS_USD.map(m => <option key={m} value={m}>{LABEL[m]}</option>)}
                      </optgroup>
                    </select>
                    {entradasPago.length > 1 && (
                      <button
                        onClick={() => eliminarEntrada(entrada.id)}
                        className="shrink-0 text-gray-500 hover:text-red-400 transition-colors px-1 text-sm"
                      >✕</button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder={`Monto ${monedaLabel}`}
                      value={entrada.monto}
                      onChange={e => actualizarEntrada(entrada.id, 'monto', e.target.value)}
                      className={inputCls + ' pr-10'}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                      {monedaLabel}
                    </span>
                  </div>
                  {requiereReferencia(entrada.metodo) && (
                    <input
                      type="text"
                      placeholder={
                        entrada.metodo === 'pago_movil' || entrada.metodo === 'banesco_pos'
                          ? 'Últimos 4 dígitos'
                          : entrada.metodo === 'vale'
                          ? 'A nombre de / Observación'
                          : 'Referencia / Comprobante'
                      }
                      value={entrada.referencia}
                      onChange={e => actualizarEntrada(entrada.id, 'referencia', e.target.value)}
                      className={inputCls}
                    />
                  )}
                  {esBiopago(entrada.metodo) && (
                    <div className="bg-amber-900/20 border border-amber-700 rounded-lg px-2 py-1.5 text-xs text-amber-300">
                      Confirme el cobro en el dispositivo Banesco antes de continuar
                    </div>
                  )}
                  <MethodBadge metodo={entrada.metodo} />
                </div>
              )
            })}
          </div>

          {/* Botón agregar método */}
          {!pagoCompleto && (
            <button
              onClick={agregarEntrada}
              className="w-full border border-dashed border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500 rounded-lg py-1.5 text-xs font-medium transition-colors"
            >
              + Agregar método de pago
            </button>
          )}

          {/* Resumen de pago acumulado */}
          {carrito.length > 0 && (
            <div className={`rounded-lg px-3 py-2 text-xs border space-y-1 ${
              pagoCompleto
                ? 'bg-emerald-900/30 border-emerald-700'
                : totalPagadoUsd > 0
                  ? 'bg-amber-900/20 border-amber-700'
                  : 'bg-gray-800 border-gray-700'
            }`}>
              {totalPagadoUsd > 0 && (
                <div className="flex justify-between text-gray-400">
                  <span>Pagado</span>
                  <span className="font-semibold text-gray-200">
                    {formatVES(totalPagadoUsd * tasaValor)} / {formatUSD(totalPagadoUsd)}
                  </span>
                </div>
              )}
              {pagoCompleto ? (
                <div className="flex justify-between font-semibold text-emerald-400">
                  <span>✓ Monto cubierto</span>
                  {excedentUsd > 0.001 && (
                    <span className="text-emerald-300">Vuelto: {formatVES(excedentUsd * tasaValor)}</span>
                  )}
                </div>
              ) : (
                <div className="flex justify-between font-semibold">
                  <span className="text-amber-400">Faltante</span>
                  <span className="text-amber-300">
                    {formatVES(faltanteUsd * tasaValor)} / {formatUSD(faltanteUsd)}
                  </span>
                </div>
              )}
            </div>
          )}

          {alertasInventario.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2 space-y-0.5">
              <p className="text-xs font-semibold text-amber-400">⚠️ Por favor solicitar recarga de saldos:</p>
              {alertasInventario.map((a, i) => (
                <p key={i} className="text-xs text-amber-300">{a}</p>
              ))}
            </div>
          )}

          {!cajaId && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-300">
              ⚠️ No hay caja abierta.{' '}
              <a href="/cortes" className="underline font-medium text-amber-200">Abrir turno</a>
            </div>
          )}

          <button
            onClick={() => itemsRecarga.length > 0 ? abrirModalSistema() : procesarPago()}
            disabled={!puedeConfirmar || procesando}
            className="w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {procesando ? 'Procesando...' : 'Confirmar venta'}
          </button>
        </div>
      </div>
    </div>

    {/* ── Modal: Selección sistema de recarga ── */}
    {modalSistemaRecarga && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Sistema de inventario</h2>
            <button onClick={() => setModalSistemaRecarga(false)} className="text-gray-500 hover:text-gray-200 text-xl leading-none">✕</button>
          </div>
          <p className="text-xs text-gray-400">
            Confirma o cambia el sistema del que se descontará el saldo para cada recarga.
          </p>

          <div className="space-y-3">
            {itemsRecarga.map(item => {
              const selSisId  = sistemaOverrides[item.producto.id] ?? item.producto.sistema_id
              const selSis    = sistemasDisponibles.find(s => s.id === selSisId)
              const saldoDisp = caja?.turno === 2 ? (selSis?.saldo_turno_2 ?? 0) : (selSis?.saldo_turno_1 ?? 0)
              const requerido = consumoEstimadoItem(item)
              const insuficiente = requerido > 0 && saldoDisp < requerido && selSis?.tipo !== 'contador'

              return (
                <div key={item.producto.id} className="bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-100">{item.producto.nombre}</span>
                    <span className="text-xs text-gray-400">{item.cantidad} × {formatVES(requerido / item.cantidad)}</span>
                  </div>
                  <select
                    value={selSisId ?? ''}
                    onChange={e => setSistemaOverrides(prev => ({ ...prev, [item.producto.id]: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {sistemasDisponibles.map(s => {
                      const saldo = caja?.turno === 2 ? s.saldo_turno_2 : s.saldo_turno_1
                      return (
                        <option key={s.id} value={s.id}>
                          {s.nombre}  —  {formatVES(saldo)} disponible
                        </option>
                      )
                    })}
                  </select>
                  {insuficiente && (
                    <p className="text-xs text-amber-400">
                      ⚠️ Saldo insuficiente: se necesita {formatVES(requerido)}, hay {formatVES(saldoDisp)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setModalSistemaRecarga(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => { setModalSistemaRecarga(false); procesarPago() }}
              disabled={procesando}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {procesando ? 'Procesando...' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Premio Lotería ── */}
    {modalPosLoteria && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Premio Lotería</h2>
            <button onClick={() => setModalPosLoteria(false)} className="text-gray-500 hover:text-gray-200 text-xl leading-none">✕</button>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Sistema de lotería</label>
            <select value={posLotProdId} onChange={e => setPosLotProdId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="">— Seleccionar —</option>
              {posLotProds.map(p => <option key={p.producto_id} value={p.producto_id}>{p.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">N° de ticket premiado <span className="text-red-400">*</span></label>
            <input value={posLotTicket} onChange={e => setPosLotTicket(e.target.value)} placeholder="Ej. 1234"
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Moneda</label>
              <select value={posLotMoneda} onChange={e => setPosLotMoneda(e.target.value as 'USD' | 'VES')}
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="VES">Bs. (VES)</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Monto</label>
              <input type="number" step="0.01" min="0" value={posLotMonto} onChange={e => setPosLotMonto(e.target.value)} placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">Fuente de pago</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPosLotFuente('caja')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${posLotFuente === 'caja' ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                Efectivo de caja
              </button>
              <button onClick={() => setPosLotFuente('externo')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${posLotFuente === 'externo' ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                Fondo externo
              </button>
            </div>
            {posLotFuente === 'externo' && (
              <select value={posLotMetodo} onChange={e => setPosLotMetodo(e.target.value as 'efectivo' | 'pago_movil')}
                className="mt-2 w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500">
                <option value="efectivo">Efectivo</option>
                <option value="pago_movil">Pago Móvil</option>
              </select>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Observaciones</label>
            <input value={posLotObs} onChange={e => setPosLotObs(e.target.value)} placeholder="Opcional..."
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setModalPosLoteria(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancelar</button>
            <button onClick={registrarPremioLoteria}
              disabled={posLotGuardando || !cajaId || !posLotProdId || !posLotTicket.trim() || !posLotMonto || parseFloat(posLotMonto) <= 0}
              className="bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-colors">
              {posLotGuardando ? 'Registrando...' : 'Registrar premio'}
            </button>
          </div>
          {!cajaId && <p className="text-xs text-yellow-400 text-center">No hay caja activa en este turno</p>}
        </div>
      </div>
    )}

    {/* ── Modal: Premio Boletería ── */}
    {modalPosTickets && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Premio Boletería</h2>
            <button onClick={() => setModalPosTickets(false)} className="text-gray-500 hover:text-gray-200 text-xl leading-none">✕</button>
          </div>

          {!posTkSemanaId && (
            <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/50 rounded-lg px-3 py-2">No hay semana activa de tickets.</p>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-2">Tipo de premio</label>
            <div className="grid grid-cols-2 gap-2">
              {(['reintegro', 'mayor'] as const).map(t => (
                <button key={t} onClick={() => setPosTkTipo(t)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${posTkTipo === t ? 'bg-purple-700 text-white border-purple-600' : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'}`}>
                  {t === 'reintegro' ? 'Reintegro' : 'Premio mayor'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Ticket (opcional)</label>
            <select value={posTkProdId} onChange={e => {
              setPosTkProdId(e.target.value)
              if (e.target.value) {
                const p = posTkProds.find(x => x.id === e.target.value)
                if (p) {
                  setPosTkMoneda(p.moneda_precio)
                  if (posTkTipo === 'reintegro') setPosTkMonto((p.moneda_precio === 'USD' ? p.precio_usd : (p.precio_ves ?? 0)).toString())
                }
              }
            }}
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Sin ticket específico —</option>
              {posTkProds.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.moneda_precio})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Moneda</label>
              <select value={posTkMoneda} onChange={e => setPosTkMoneda(e.target.value as 'USD' | 'VES')}
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="VES">Bs. (VES)</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Monto</label>
              <input type="number" step="0.01" min="0" value={posTkMonto} onChange={e => setPosTkMonto(e.target.value)} placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">Fuente de pago</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPosTkFuente('caja')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${posTkFuente === 'caja' ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                Efectivo de caja
              </button>
              <button onClick={() => setPosTkFuente('externo')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${posTkFuente === 'externo' ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                Fondo externo
              </button>
            </div>
            {posTkFuente === 'externo' && (
              <select value={posTkMetodo} onChange={e => setPosTkMetodo(e.target.value as 'efectivo' | 'pago_movil')}
                className="mt-2 w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500">
                <option value="efectivo">Efectivo</option>
                <option value="pago_movil">Pago Móvil</option>
              </select>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Observaciones</label>
            <input value={posTkObs} onChange={e => setPosTkObs(e.target.value)} placeholder="Opcional..."
              className="w-full bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setModalPosTickets(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">Cancelar</button>
            <button onClick={registrarPremioTickets}
              disabled={posTkGuardando || !cajaId || !posTkSemanaId || !posTkMonto || parseFloat(posTkMonto) <= 0}
              className="bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {posTkGuardando ? 'Registrando...' : 'Registrar premio'}
            </button>
          </div>
          {!cajaId && <p className="text-xs text-yellow-400 text-center">No hay caja activa en este turno</p>}
        </div>
      </div>
    )}
    </>
  )
}
