import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const {
      nombre, categoria_id, sistema_id, imagen_url, monto_variable, activo,
      moneda_precio,
      costo_usd, precio_usd,
      costo_ves, precio_ves,
    } = body

    const esVes = moneda_precio === 'VES'

    if (!monto_variable) {
      if (!esVes && precio_usd < costo_usd) {
        return NextResponse.json({ error: 'El precio no puede ser menor al costo' }, { status: 400 })
      }
      if (esVes && precio_ves < costo_ves) {
        return NextResponse.json({ error: 'El precio no puede ser menor al costo' }, { status: 400 })
      }
    }

    const comision_usd = monto_variable || esVes ? 0 : precio_usd - costo_usd
    const comision_ves = monto_variable || !esVes ? null : precio_ves - costo_ves

    // Resolver sistema_id para categorías con inventario_unidades
    let sistemaFinal = sistema_id ?? null
    if (categoria_id && nombre) {
      const { data: cat } = await supabase
        .from('categorias')
        .select('inventario_unidades')
        .eq('id', categoria_id)
        .single()

      if (cat?.inventario_unidades) {
        // Buscar el producto actual para obtener su sistema_id existente
        const { data: prodActual } = await supabase
          .from('productos')
          .select('sistema_id')
          .eq('id', id)
          .single()

        if (prodActual?.sistema_id) {
          // Sincronizar nombre del sistema con el nombre del producto
          await supabase
            .from('sistemas_inventario')
            .update({ nombre: nombre.trim() })
            .eq('id', prodActual.sistema_id)
          sistemaFinal = prodActual.sistema_id
        } else {
          // Crear nuevo sistema si no tenía uno
          const { data: nuevoSistema } = await supabase
            .from('sistemas_inventario')
            .insert({ nombre: nombre.trim(), tipo: 'unidades' })
            .select()
            .single()
          if (nuevoSistema) sistemaFinal = nuevoSistema.id
        }
      }
    }

    const { data, error } = await supabase
      .from('productos')
      .update({
        nombre, categoria_id, sistema_id: sistemaFinal, monto_variable, activo,
        imagen_url: imagen_url ?? null,
        moneda_precio: moneda_precio ?? 'USD',
        costo_usd: esVes ? 0 : costo_usd,
        precio_usd: esVes ? 0 : precio_usd,
        comision_usd,
        costo_ves: esVes ? costo_ves : null,
        precio_ves: esVes ? precio_ves : null,
        comision_ves,
      })
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { error } = await supabase
      .from('productos')
      .update({ activo: false })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
