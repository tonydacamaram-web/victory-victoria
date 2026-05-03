import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!['admin', 'supervisor'].includes(usuario?.rol ?? '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id } = await params
    const { cantidad, descripcion, turno } = await request.json()

    if (!cantidad || cantidad === 0) {
      return NextResponse.json({ error: 'La cantidad no puede ser cero' }, { status: 400 })
    }

    const { data: sistema, error: sErr } = await supabase
      .from('sistemas_inventario')
      .select('id, tipo, saldo_actual, saldo_turno_1, saldo_turno_2')
      .eq('id', id)
      .single()
    if (sErr || !sistema) return NextResponse.json({ error: 'Sistema no encontrado' }, { status: 404 })

    let updErr
    if (sistema.tipo === 'contador') {
      // Contadores acumulan en saldo_actual (compartido)
      const res = await supabase
        .from('sistemas_inventario')
        .update({ saldo_actual: sistema.saldo_actual + cantidad })
        .eq('id', id)
      updErr = res.error
    } else {
      // Inventario por turno
      const t = turno === 2 ? 2 : 1
      const col = t === 1 ? 'saldo_turno_1' : 'saldo_turno_2'
      const prev = t === 1 ? sistema.saldo_turno_1 : sistema.saldo_turno_2
      const res = await supabase
        .from('sistemas_inventario')
        .update({ [col]: prev + cantidad })
        .eq('id', id)
      updErr = res.error
    }
    if (updErr) throw updErr

    const turnoMovimiento = sistema.tipo === 'contador' ? null : (turno === 2 ? 2 : 1)
    const { data: movimiento, error: movErr } = await supabase
      .from('movimientos_inventario')
      .insert({
        sistema_id: id,
        tipo: cantidad < 0 ? 'ajuste' : 'carga',
        cantidad,
        descripcion: descripcion?.trim() || null,
        usuario_id: user.id,
        turno: turnoMovimiento,
      })
      .select()
      .single()
    if (movErr) throw movErr

    return NextResponse.json({ success: true, movimiento }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
