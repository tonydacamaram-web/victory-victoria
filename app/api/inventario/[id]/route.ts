import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
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
    const body = await request.json()

    // Reset a 0 (todos los tipos)
    if (body.reset === true) {
      const { data, error } = await supabase
        .from('sistemas_inventario')
        .update({ saldo_actual: 0, saldo_turno_1: 0, saldo_turno_2: 0 })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    const { tipo, moneda } = body

    // Cambio de moneda
    if (moneda !== undefined) {
      if (!['VES', 'USD'].includes(moneda)) {
        return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('sistemas_inventario')
        .update({ moneda })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (!['saldo_ves', 'unidades', 'contador'].includes(tipo)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('sistemas_inventario')
      .update({ tipo })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
