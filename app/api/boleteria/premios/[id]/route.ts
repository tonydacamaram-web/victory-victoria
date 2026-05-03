import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// PATCH /api/boleteria/premios/[id] — editable por cualquier usuario autenticado
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    const {
      producto_id, tipo, moneda, monto, observaciones, fuente, metodo_externo,
      boletos_producto_id, boletos_cantidad,
    } = await request.json()

    if (monto !== undefined && parseFloat(monto) <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
    }

    if (boletos_cantidad !== undefined && boletos_cantidad !== null && boletos_cantidad <= 0) {
      return NextResponse.json({ error: 'La cantidad de boletos debe ser mayor a cero' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    if (producto_id  !== undefined) update.producto_id   = producto_id || null
    if (tipo         !== undefined) update.tipo          = tipo
    if (moneda       !== undefined) update.moneda        = moneda
    if (monto        !== undefined) update.monto         = parseFloat(monto)
    if (observaciones !== undefined) update.observaciones = observaciones || null
    if (fuente       !== undefined) update.fuente        = fuente
    if (metodo_externo !== undefined) {
      update.metodo_externo = fuente === 'externo' ? metodo_externo : null
    }
    if (boletos_producto_id !== undefined) update.boletos_producto_id = boletos_producto_id || null
    if (boletos_cantidad    !== undefined) update.boletos_cantidad    = boletos_cantidad || null

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('premios_boleteria')
      .update(update)
      .eq('id', id)
      .select('*, producto:productos!producto_id(nombre), caja:cajas(turno)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/boleteria/premios/[id] — solo admin/supervisor
export async function DELETE(
  _request: NextRequest,
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
      return NextResponse.json({ error: 'Solo administradores pueden anular premios' }, { status: 403 })
    }

    const { id } = await params

    const admin = createAdminClient()
    const { error } = await admin
      .from('premios_boleteria')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
