import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/boleteria/semanas/[id]/ventas
// Devuelve las transacciones con items de lotería en el rango de la semana
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: semana_id } = await params

    const { data: semana, error: semErr } = await supabase
      .from('semanas_boleteria')
      .select('fecha_inicio, fecha_fin')
      .eq('id', semana_id)
      .single()

    if (semErr || !semana) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 })

    const fechaInicio = semana.fecha_inicio + 'T00:00:00'
    const fechaFin = semana.fecha_fin + 'T23:59:59'

    // IDs de productos de lotería
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, moneda_precio, precio_usd, precio_ves, categoria:categorias!inner(nombre)')
      .eq('categorias.nombre', 'Boleteria')

    const prodIds = (productos ?? []).map((p: { id: string }) => p.id)
    if (!prodIds.length) return NextResponse.json([])

    // Transacciones que contienen al menos un item de lotería en el período
    const { data: items } = await supabase
      .from('items_transaccion')
      .select(`
        id,
        producto_id,
        nombre_producto,
        precio_usd,
        transaccion:transacciones!inner(
          id, created_at, anulada, caja_id,
          caja:cajas(nombre),
          usuario:usuarios(nombre)
        )
      `)
      .in('producto_id', prodIds)
      .gte('transacciones.created_at', fechaInicio)
      .lte('transacciones.created_at', fechaFin)

    if (!items?.length) return NextResponse.json([])

    // Agrupar por transaccion_id
    type TxRaw = {
      id: string; created_at: string; anulada: boolean; caja_id: string;
      caja: { nombre: string } | null; usuario: { nombre: string } | null
    }
    type ItemRaw = { id: string; producto_id: string; nombre_producto: string; precio_usd: number; transaccion: unknown }

    const txMap = new Map<string, {
      transaccion_id: string; created_at: string; anulada: boolean
      caja_nombre: string; usuario_nombre: string
      items: { producto_id: string; nombre_producto: string; precio_usd: number }[]
    }>()

    for (const item of (items as ItemRaw[])) {
      const tx = item.transaccion as TxRaw | TxRaw[] | null
      const t = Array.isArray(tx) ? tx[0] : tx
      if (!t) continue
      if (!txMap.has(t.id)) {
        txMap.set(t.id, {
          transaccion_id: t.id,
          created_at: t.created_at,
          anulada: t.anulada,
          caja_nombre: (t.caja as { nombre: string } | null)?.nombre ?? '',
          usuario_nombre: (t.usuario as { nombre: string } | null)?.nombre ?? '',
          items: [],
        })
      }
      txMap.get(t.id)!.items.push({
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto,
        precio_usd: item.precio_usd,
      })
    }

    const result = Array.from(txMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
