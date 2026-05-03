import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MetodoPago, METODOS_DIVISAS } from '@/types'

interface ItemInput {
  producto_id: string
  nombre_producto: string
  costo_usd: number
  precio_usd: number
  comision_cobrada: number
  comision_definida: number
  monto_libre_usd?: number
  // Campos de inventario enviados desde el POS
  sistema_id?: string | null
  sistema_tipo?: 'saldo_ves' | 'unidades' | 'contador' | null
  consumo_inventario?: number // VES o unidades a descontar
}

interface PagoInput {
  metodo: MetodoPago
  moneda: string
  monto: number
  referencia?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const { caja_id, items, pagos, tasa_aplicada, observaciones } = body

    if (!caja_id || !items?.length || !pagos?.length) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // ─── AGRUPAR CONSUMOS POR SISTEMA ───────────────────────────
    const consumosPorSistema = new Map<string, { nombre: string; tipo: string; requerido: number }>()

    for (const item of items as ItemInput[]) {
      if (!item.sistema_id || !item.consumo_inventario) continue
      const prev = consumosPorSistema.get(item.sistema_id)
      consumosPorSistema.set(item.sistema_id, {
        nombre: item.nombre_producto,
        tipo: item.sistema_tipo ?? 'saldo_ves',
        requerido: (prev?.requerido ?? 0) + item.consumo_inventario,
      })
    }
    // ────────────────────────────────────────────────────────────

    // Calcular totales desde items
    const subtotal_usd = items.reduce((sum: number, i: ItemInput) => sum + i.costo_usd, 0)
    const comision_total_usd = items.reduce((sum: number, i: ItemInput) => sum + i.comision_cobrada, 0)

    const metodos: MetodoPago[] = pagos.map((p: PagoInput) => p.metodo)
    const tieneVes = pagos.some((p: PagoInput) => !METODOS_DIVISAS.includes(p.metodo))
    const tieneUsd = pagos.some((p: PagoInput) => METODOS_DIVISAS.includes(p.metodo))
    const moneda_cobro = tieneVes && tieneUsd ? 'MIXTO' : tieneVes ? 'VES' : 'USD'

    const total_usd = pagos
      .filter((p: PagoInput) => p.moneda === 'USD')
      .reduce((sum: number, p: PagoInput) => sum + p.monto, 0)
    const total_ves = pagos
      .filter((p: PagoInput) => p.moneda === 'VES')
      .reduce((sum: number, p: PagoInput) => sum + p.monto, 0)

    // Insertar transacción
    const { data: transaccion, error: txError } = await supabase
      .from('transacciones')
      .insert({
        caja_id,
        usuario_id: user.id,
        metodo_pago: metodos,
        moneda_cobro,
        tasa_aplicada,
        subtotal_usd,
        comision_total_usd,
        total_usd,
        total_ves,
        observaciones,
      })
      .select()
      .single()

    if (txError) throw txError

    // Insertar items (sin los campos de inventario)
    const itemsInsert = items.map((i: ItemInput) => ({
      transaccion_id: transaccion.id,
      producto_id: i.producto_id,
      nombre_producto: i.nombre_producto,
      costo_usd: i.costo_usd,
      precio_usd: i.precio_usd,
      comision_cobrada: i.comision_cobrada,
      comision_definida: i.comision_definida,
      monto_libre_usd: i.monto_libre_usd ?? null,
    }))
    const { error: itemsError } = await supabase
      .from('items_transaccion')
      .insert(itemsInsert)
    if (itemsError) throw itemsError

    // Insertar pagos
    const pagosInsert = pagos.map((p: PagoInput) => ({
      ...p,
      transaccion_id: transaccion.id,
    }))
    const { error: pagosError } = await supabase
      .from('pagos_transaccion')
      .insert(pagosInsert)
    if (pagosError) throw pagosError

    // ─── ACTUALIZAR INVENTARIO ───────────────────────────────────
    if (consumosPorSistema.size > 0) {
      // Obtener turno de la caja para saber qué columna actualizar
      const { data: cajaData } = await supabase
        .from('cajas').select('turno').eq('id', caja_id).single()
      const turno: 1 | 2 = cajaData?.turno === 2 ? 2 : 1

      for (const [sistema_id, consumo] of consumosPorSistema) {
        if (consumo.tipo === 'contador') {
          // Acumula en saldo_actual (compartido, sin distinción de turno)
          await supabase.rpc('decrementar_saldo_sistema', {
            p_sistema_id: sistema_id,
            p_cantidad: -consumo.requerido,
          })
          await supabase.from('movimientos_inventario').insert({
            sistema_id, tipo: 'venta',
            cantidad: consumo.requerido,
            descripcion: 'Venta registrada',
            transaccion_id: transaccion.id,
            usuario_id: user.id,
            turno: null,
          })
        } else {
          // Inventario controlado: descuenta del turno correspondiente
          await supabase.rpc('ajustar_saldo_turno', {
            p_sistema_id: sistema_id,
            p_cantidad: consumo.requerido,
            p_turno: turno,
          })
          await supabase.from('movimientos_inventario').insert({
            sistema_id, tipo: 'venta',
            cantidad: -consumo.requerido,
            descripcion: 'Venta registrada',
            transaccion_id: transaccion.id,
            usuario_id: user.id,
            turno,
          })
        }
      }
    }
    // ────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true, transaccion }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios').select('rol').eq('id', user.id).single()
    const esCajero = usuario?.rol === 'cajero'

    const { searchParams } = new URL(request.url)

    const caja_id = searchParams.get('caja_id')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    const esAdmin = ['admin', 'supervisor'].includes(usuario?.rol ?? '')

    let query = supabase
      .from('transacciones')
      .select('*, items:items_transaccion(*, producto:productos(nombre, categoria:categorias(nombre), sistema:sistemas_inventario(nombre))), pagos:pagos_transaccion(*), caja:cajas(nombre, turno_inicio, turno_fin, usuario_id, usuario:usuarios(nombre))')
      .order('created_at', { ascending: false })

    // Cajeros y otros roles no admin sólo ven transacciones activas
    if (!esAdmin) query = query.eq('anulada', false)

    if (caja_id) query = query.eq('caja_id', caja_id)
    if (desde) query = query.gte('created_at', desde)
    if (hasta) query = query.lte('created_at', hasta)

    if (esCajero) {
      // Fetch only cajas belonging to this user first, then filter transactions
      const { data: cajas } = await supabase
        .from('cajas').select('id').eq('usuario_id', user.id)
      const cajaIds = (cajas ?? []).map(c => c.id)
      if (cajaIds.length === 0) return NextResponse.json([])
      query = query.in('caja_id', cajaIds)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
