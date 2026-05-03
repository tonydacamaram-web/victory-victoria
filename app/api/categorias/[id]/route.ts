import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const { nombre, activa, cobra_comision, inventario_unidades } = await request.json()

    if (nombre !== undefined && !nombre.trim()) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (nombre !== undefined) updates.nombre = nombre.trim()
    if (activa !== undefined) updates.activa = activa
    if (cobra_comision !== undefined) updates.cobra_comision = cobra_comision
    if (inventario_unidades !== undefined) updates.inventario_unidades = inventario_unidades

    const { data, error } = await supabase
      .from('categorias')
      .update(updates)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // Verificar que no tenga productos asociados
    const { count } = await supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', id)

    if (count && count > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${count} producto(s) asociado(s)` },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('categorias')
      .delete()
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
