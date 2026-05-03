import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/boleteria/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Devuelve una fila por TRANSACCIÓN que contenga productos de Boleteria.
// Incluye total_usd real de la transacción para calcular unidades correctamente
// incluso en transacciones registradas antes del fix de flatMap (item único × N unidades).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Parámetros desde y hasta requeridos' }, { status: 400 })
    }

    // Productos de categoría Boleteria
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, moneda_precio, precio_usd, precio_ves, categoria:categorias!inner(nombre)')
      .eq('categorias.nombre', 'Boleteria')

    const prodIds = (productos ?? []).map((p: { id: string }) => p.id)
    if (!prodIds.length) return NextResponse.json([])

    const fechaInicio = desde + 'T00:00:00+00:00'
    const fechaFin    = hasta + 'T23:59:59+00:00'

    const { data: items, error: itemsErr } = await supabase
      .from('items_transaccion')
      .select(`
        id,
        producto_id,
        nombre_producto,
        precio_usd,
        transaccion:transacciones!inner(
          id, created_at, anulada, total_usd, total_ves,
          caja:cajas(nombre, turno),
          usuario:usuarios(nombre)
        )
      `)
      .in('producto_id', prodIds)
      .gte('transacciones.created_at', fechaInicio)
      .lte('transacciones.created_at', fechaFin)

    if (itemsErr) {
      console.error('[boleteria/ventas] Error:', itemsErr)
      throw itemsErr
    }

    if (!items?.length) return NextResponse.json([])

    type TxRaw = {
      id: string; created_at: string; anulada: boolean
      total_usd: number; total_ves: number
      caja: { nombre: string; turno: number | null } | null
      usuario: { nombre: string } | null
    }
    type ItemRaw = {
      id: string; producto_id: string; nombre_producto: string
      precio_usd: number; transaccion: unknown
    }

    // Agrupar por transaccion_id
    type Producto = { nombre: string; filas: number; precio_usd_unitario: number }
    type TxGroup = {
      transaccion_id: string
      created_at: string
      anulada: boolean
      total_usd: number
      total_ves: number
      caja_nombre: string
      turno: number | null
      usuario_nombre: string
      productos: Map<string, Producto>
    }

    const txMap = new Map<string, TxGroup>()

    for (const item of items as ItemRaw[]) {
      const raw = item.transaccion as TxRaw | TxRaw[] | null
      const t = Array.isArray(raw) ? raw[0] : raw
      if (!t) continue

      if (!txMap.has(t.id)) {
        txMap.set(t.id, {
          transaccion_id:  t.id,
          created_at:      t.created_at,
          anulada:         t.anulada,
          total_usd:       t.total_usd ?? 0,
          total_ves:       t.total_ves ?? 0,
          caja_nombre:     (t.caja as { nombre: string } | null)?.nombre ?? '',
          turno:           (t.caja as { turno: number | null } | null)?.turno ?? null,
          usuario_nombre:  (t.usuario as { nombre: string } | null)?.nombre ?? '',
          productos:       new Map(),
        })
      }

      const tx = txMap.get(t.id)!
      const prev = tx.productos.get(item.producto_id)
      tx.productos.set(item.producto_id, {
        nombre:               item.nombre_producto,
        filas:                (prev?.filas ?? 0) + 1,
        precio_usd_unitario:  item.precio_usd,
      })
    }

    // Convertir a array serializable, calculando unidades inferidas donde aplique
    const result = Array.from(txMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(tx => {
        const prods = Array.from(tx.productos.entries()).map(([producto_id, p]) => {
          // Inferencia de unidades: si la transacción tiene UN SOLO tipo de producto
          // boletería y el total encaja exactamente con un múltiplo del precio unitario,
          // usamos el total real para deducir la cantidad (corrige datos pre-fix).
          let cantidad = p.filas
          let cantidad_inferida = false
          if (tx.productos.size === 1 && p.precio_usd_unitario > 0) {
            const inferido = Math.round(tx.total_usd / p.precio_usd_unitario)
            if (inferido > p.filas) {
              cantidad = inferido
              cantidad_inferida = true
            }
          }
          return { producto_id, nombre: p.nombre, cantidad, cantidad_inferida, precio_usd_unitario: p.precio_usd_unitario }
        })

        return {
          transaccion_id:  tx.transaccion_id,
          created_at:      tx.created_at,
          anulada:         tx.anulada,
          total_usd:       tx.total_usd,
          total_ves:       tx.total_ves,
          caja_nombre:     tx.caja_nombre,
          turno:           tx.turno,
          usuario_nombre:  tx.usuario_nombre,
          productos:       prods,
        }
      })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
