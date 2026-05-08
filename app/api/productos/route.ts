import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const categoria = searchParams.get('categoria')
    const activo = searchParams.get('activo')
    const q = searchParams.get('q')

    let query = supabase
      .from('productos')
      .select('*, categoria:categorias(id, nombre, cobra_comision, inventario_unidades), sistema:sistemas_inventario(id, nombre, tipo, saldo_actual, saldo_turno_1, saldo_turno_2)')

    if (activo !== 'all') {
      const activoFilter = activo === 'false' ? false : true
      query = query.eq('activo', activoFilter)
    }

    if (categoria) {
      query = query.eq('categorias.nombre', categoria)
    }

    if (q) {
      query = query.ilike('nombre', `%${q}%`)
    }

    query = query.order('nombre')

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
      nombre, categoria_id, sistema_id, imagen_url, monto_variable, activo,
      moneda_precio, costo_indexado_usd, comision_pct, cobra_comision_fija,
      costo_usd, precio_usd,
      costo_ves, precio_ves,
    } = body

    const esVes = moneda_precio === 'VES'
    const esIndexado = esVes && !!costo_indexado_usd

    if (!monto_variable) {
      if (!esVes && precio_usd < costo_usd) {
        return NextResponse.json({ error: 'El precio no puede ser menor al costo' }, { status: 400 })
      }
      if (esVes && !esIndexado && precio_ves < costo_ves) {
        return NextResponse.json({ error: 'El precio no puede ser menor al costo' }, { status: 400 })
      }
    }

    // Productos indexados en USD no guardan comisión estática — se calcula dinámicamente con la tasa
    const comision_usd = monto_variable || esVes ? 0 : precio_usd - costo_usd
    const comision_ves = monto_variable || !esVes || esIndexado ? null : precio_ves - costo_ves

    // Si la categoría tiene inventario_unidades, auto-crear sistema propio
    let sistemaFinal = sistema_id ?? null
    const { data: cat } = await supabase
      .from('categorias')
      .select('inventario_unidades')
      .eq('id', categoria_id)
      .single()

    if (cat?.inventario_unidades) {
      const { data: nuevoSistema } = await supabase
        .from('sistemas_inventario')
        .insert({ nombre: nombre.trim(), tipo: 'unidades' })
        .select()
        .single()
      if (nuevoSistema) sistemaFinal = nuevoSistema.id
    }

    const { data, error } = await supabase
      .from('productos')
      .insert({
        nombre, categoria_id, sistema_id: sistemaFinal, monto_variable, activo,
        imagen_url: imagen_url ?? null,
        moneda_precio: moneda_precio ?? 'USD',
        costo_indexado_usd: esIndexado,
        comision_pct: monto_variable ? (comision_pct ?? null) : null,
        cobra_comision_fija: monto_variable ? (cobra_comision_fija ?? true) : true,
        costo_usd: esVes ? (esIndexado ? costo_usd : 0) : costo_usd,
        precio_usd: esVes ? 0 : precio_usd,
        comision_usd,
        costo_ves: esVes && !esIndexado ? costo_ves : null,
        precio_ves: esVes ? precio_ves : null,
        comision_ves,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
