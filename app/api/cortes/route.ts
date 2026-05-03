import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios').select('rol').eq('id', user.id).single()
    const esCajero = usuario?.rol === 'cajero'

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    let query = supabase
      .from('cortes_caja')
      .select(`
        *,
        caja:cajas(nombre, turno_inicio, turno_fin, saldo_apertura_usd, saldo_apertura_ves),
        usuario:usuarios!cortes_caja_usuario_id_fkey(nombre)
      `)
      .order('created_at', { ascending: false })

    if (esCajero) query = query.eq('usuario_id', user.id)
    if (desde) query = query.gte('created_at', desde)
    if (hasta) query = query.lte('created_at', hasta)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const {
      caja_id, tipo, efectivo_contado_usd, efectivo_contado_ves, observaciones,
      fondo_devuelto_usd = 0, fondo_devuelto_ves = 0,
      contado_por_metodo = null,
    } = body

    // Calcular totales del sistema para este turno
    const { data: transacciones } = await supabase
      .from('transacciones')
      .select('total_usd, total_ves, comision_total_usd')
      .eq('caja_id', caja_id)
      .eq('anulada', false)

    const total_sistema_usd = transacciones?.reduce((s, t) => s + t.total_usd, 0) ?? 0
    const total_sistema_ves = transacciones?.reduce((s, t) => s + t.total_ves, 0) ?? 0
    const comision_total_usd = transacciones?.reduce((s, t) => s + t.comision_total_usd, 0) ?? 0

    // Premios de lotería pagados desde esta caja (reducen el efectivo esperado)
    const { data: premios } = await supabase
      .from('premios_loteria')
      .select('moneda, monto, fuente')
      .eq('caja_id', caja_id)

    // Solo premios pagados con efectivo de caja afectan el corte
    const premios_usd = premios?.filter(p => p.moneda === 'USD' && p.fuente === 'caja').reduce((s, p) => s + p.monto, 0) ?? 0
    const premios_ves = premios?.filter(p => p.moneda === 'VES' && p.fuente === 'caja').reduce((s, p) => s + p.monto, 0) ?? 0

    // Obtener datos de caja: fondo de apertura, turno y operador
    const { data: cajaData } = await supabase
      .from('cajas').select('saldo_apertura_usd, saldo_apertura_ves, turno, usuario_id').eq('id', caja_id).single()
    const apertura_usd = cajaData?.saldo_apertura_usd ?? 0
    const apertura_ves = cajaData?.saldo_apertura_ves ?? 0
    const turno_caja = cajaData?.turno ?? null
    const operador_id = cajaData?.usuario_id ?? user.id

    // diferencia total = dif_ventas + dif_fondo
    //   dif_ventas = contado_ventas - (ventas_sistema - premios)
    //   dif_fondo  = fondo_devuelto - fondo_apertura
    const diferencia_usd =
      ((efectivo_contado_usd ?? 0) - (total_sistema_usd - premios_usd)) +
      (fondo_devuelto_usd - apertura_usd)
    const diferencia_ves =
      ((efectivo_contado_ves ?? 0) - (total_sistema_ves - premios_ves)) +
      (fondo_devuelto_ves - apertura_ves)

    const { data, error } = await supabase
      .from('cortes_caja')
      .insert({
        caja_id,
        usuario_id: user.id,
        tipo,
        total_sistema_usd,
        total_sistema_ves,
        efectivo_contado_usd: efectivo_contado_usd ?? null,
        efectivo_contado_ves: efectivo_contado_ves ?? null,
        diferencia_usd,
        diferencia_ves,
        comision_total_usd,
        premios_usd,
        premios_ves,
        fondo_devuelto_usd,
        fondo_devuelto_ves,
        observaciones,
        contado_por_metodo,
      })
      .select()
      .single()

    if (error) throw error

    // Si es corte final, cerrar la caja y resetear contadores
    if (tipo === 'final') {
      await supabase
        .from('cajas')
        .update({ estado: 'cerrada', turno_fin: new Date().toISOString() })
        .eq('id', caja_id)

      // Obtener todos los sistemas tipo 'contador' con saldo acumulado
      const { data: contadores } = await supabase
        .from('sistemas_inventario')
        .select('id, saldo_actual')
        .eq('tipo', 'contador')
        .eq('activo', true)
        .gt('saldo_actual', 0)

      if (contadores && contadores.length > 0) {
        // Registrar el cierre de cada contador como movimiento
        const movimientos = contadores.map(c => ({
          sistema_id: c.id,
          tipo: 'cierre' as const,
          cantidad: c.saldo_actual,
          turno: turno_caja,
          usuario_id: operador_id,
          descripcion: `Cierre de turno ${turno_caja ?? '—'} — corte ${data.id}`,
          transaccion_id: null,
        }))

        await supabase.from('movimientos_inventario').insert(movimientos)

        // Resetear saldo_actual de todos los contadores
        await supabase
          .from('sistemas_inventario')
          .update({ saldo_actual: 0 })
          .eq('tipo', 'contador')
          .eq('activo', true)
      }
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
