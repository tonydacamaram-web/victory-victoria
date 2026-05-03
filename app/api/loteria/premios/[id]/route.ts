import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// PATCH /api/loteria/premios/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    // Obtener el premio con su caja para verificar propiedad
    const { data: premio, error: errPremio } = await supabase
      .from('premios_loteria')
      .select('id, caja:cajas(usuario_id)')
      .eq('id', id)
      .single()

    if (errPremio || !premio) {
      return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 })
    }

    // Obtener rol del usuario actual
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    const caja = premio.caja as unknown as { usuario_id: string } | null
    const esPropio = caja?.usuario_id === user.id
    const esAdmin  = ['admin', 'supervisor'].includes(usuario?.rol ?? '')

    if (!esPropio && !esAdmin) {
      return NextResponse.json({ error: 'Sin permiso para editar este premio' }, { status: 403 })
    }

    const {
      producto_id, moneda, monto, numero_ticket, observaciones, fuente, metodo_externo,
    } = await request.json()

    if (monto !== undefined && parseFloat(monto) <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    if (producto_id  !== undefined) update.producto_id   = producto_id || null
    if (moneda       !== undefined) update.moneda        = moneda
    if (monto        !== undefined) update.monto         = parseFloat(monto)
    if (numero_ticket !== undefined) update.numero_ticket = numero_ticket?.trim() || null
    if (observaciones !== undefined) update.observaciones = observaciones || null
    if (fuente       !== undefined) update.fuente        = fuente
    if (metodo_externo !== undefined) {
      update.metodo_externo = fuente === 'externo' ? metodo_externo : null
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('premios_loteria')
      .update(update)
      .eq('id', id)
      .select('*, producto:productos(nombre), caja:cajas(turno, usuario_id)')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/loteria/premios/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    const { data: premio, error: errPremio } = await supabase
      .from('premios_loteria')
      .select('id, caja:cajas(usuario_id)')
      .eq('id', id)
      .single()

    if (errPremio || !premio) {
      return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 })
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    const caja = premio.caja as unknown as { usuario_id: string } | null
    const esPropio = caja?.usuario_id === user.id
    const esAdmin  = ['admin', 'supervisor'].includes(usuario?.rol ?? '')

    if (!esPropio && !esAdmin) {
      return NextResponse.json({ error: 'Sin permiso para eliminar este premio' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('premios_loteria')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
