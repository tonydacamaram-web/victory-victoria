import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const { data, error } = await supabase
      .from('transacciones')
      .select(`
        id, total_usd, total_ves, tasa_aplicada, moneda_cobro, referencia, observaciones,
        items:items_transaccion(id, nombre_producto, precio_usd, costo_usd, comision_cobrada, producto:productos(moneda_precio)),
        pagos:pagos_transaccion(id, metodo, moneda, monto, referencia)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH /api/transacciones/[id]
// Body: { anulada: true }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    if (body.anulada === true) {
      const admin = createAdminClient()

      // 1. Marcar transacción como anulada
      const { error } = await admin
        .from('transacciones')
        .update({ anulada: true })
        .eq('id', id)
      if (error) throw error

      // 2. Revertir movimientos de inventario generados por esta transacción
      const { data: movimientos } = await admin
        .from('movimientos_inventario')
        .select('id, sistema_id, cantidad, turno, sistema:sistemas_inventario(tipo)')
        .eq('transaccion_id', id)
        .eq('tipo', 'venta')

      for (const mov of (movimientos ?? [])) {
        const sisRaw = mov.sistema as unknown as { tipo: string } | { tipo: string }[] | null
        const tipo = (Array.isArray(sisRaw) ? sisRaw[0]?.tipo : sisRaw?.tipo) ?? 'saldo_ves'

        if (tipo === 'contador') {
          // Contador acumula ventas en saldo_actual (mov.cantidad > 0).
          // Revertir: decrementar_saldo_sistema con valor positivo resta del contador.
          await admin.rpc('decrementar_saldo_sistema', {
            p_sistema_id: mov.sistema_id,
            p_cantidad: mov.cantidad,
          })
        } else {
          // saldo_ves / unidades: mov.cantidad es negativo (consumo).
          // ajustar_saldo_turno hace saldo_turno_X -= p_cantidad.
          // Pasando mov.cantidad (negativo) → suma de vuelta al saldo.
          await admin.rpc('ajustar_saldo_turno', {
            p_sistema_id: mov.sistema_id,
            p_cantidad:   mov.cantidad,
            p_turno:      mov.turno ?? 1,
          })
        }

        // Registrar movimiento de reversión (tipo ajuste, cantidad opuesta)
        await admin.from('movimientos_inventario').insert({
          sistema_id:     mov.sistema_id,
          tipo:           'ajuste',
          cantidad:       -mov.cantidad,
          descripcion:    'Anulación de venta',
          transaccion_id: id,
          usuario_id:     user.id,
          turno:          mov.turno,
        })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Operación no permitida' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
