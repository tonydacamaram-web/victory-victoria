import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface FilaLoteria {
  producto_id: string
  nombre: string
  vendidos: number
  vendidos_t1: number
  vendidos_t2: number
  ingreso_ves: number
  ingreso_ves_t1: number
  ingreso_ves_t2: number
  comision_ves: number
  comision_ves_t1: number
  comision_ves_t2: number
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    // Productos activos de la categoría "Loteria"
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, categoria:categorias(nombre)')
      .eq('activo', true)

    const prodLoteria = (productos ?? []).filter((p) => {
      const cat = p.categoria
      if (Array.isArray(cat)) return cat[0]?.nombre === 'Loteria'
      return (cat as { nombre?: string } | null)?.nombre === 'Loteria'
    })

    if (prodLoteria.length === 0) {
      return NextResponse.json({ filas: [], total_ventas_ves: 0, total_comisiones_ves: 0 })
    }

    const productoIds = prodLoteria.map((p: { id: string }) => p.id)

    // Incluir transaccion_id y total_ves; unir a cajas para obtener turno
    let itemsQuery = supabase
      .from('items_transaccion')
      .select('producto_id, precio_usd, comision_cobrada, transaccion_id, transaccion:transacciones!inner(anulada, created_at, tasa_aplicada, total_ves, caja:cajas(turno))')
      .in('producto_id', productoIds)
      .eq('transacciones.anulada', false)

    if (desde) itemsQuery = itemsQuery.gte('transacciones.created_at', desde + 'T00:00:00-04:00')
    if (hasta) itemsQuery = itemsQuery.lte('transacciones.created_at', hasta + 'T23:59:59-04:00')

    const { data: items } = await itemsQuery

    type TxMeta = { total_ves: number; sum_precio_usd: number; tasa: number; turno: number | null }
    const txMeta = new Map<string, TxMeta>()

    // Primer paso: acumular suma de precio_usd por transacción y capturar turno
    for (const item of (items ?? [])) {
      const tx = item.transaccion as unknown as {
        anulada: boolean; created_at: string; tasa_aplicada: number; total_ves: number
        caja: { turno?: number | null } | null
      } | null
      if (!tx || tx.anulada) continue
      const turno = tx.caja?.turno ?? null
      const prev = txMeta.get(item.transaccion_id) ?? { total_ves: tx.total_ves, sum_precio_usd: 0, tasa: tx.tasa_aplicada, turno }
      txMeta.set(item.transaccion_id, { ...prev, sum_precio_usd: prev.sum_precio_usd + item.precio_usd })
    }

    type ItemAgrupado = {
      count: number; count_t1: number; count_t2: number
      ingreso_ves: number; ingreso_ves_t1: number; ingreso_ves_t2: number
      comision_ves: number; comision_ves_t1: number; comision_ves_t2: number
    }
    const ventasMap = new Map<string, ItemAgrupado>()

    // Segundo paso: calcular VES exacto por item y acumular por turno
    for (const item of (items ?? [])) {
      const tx = item.transaccion as unknown as { anulada: boolean; tasa_aplicada: number; total_ves: number } | null
      if (!tx || tx.anulada) continue

      const meta = txMeta.get(item.transaccion_id)
      let itemVes: number

      if (meta && meta.total_ves > 0 && meta.sum_precio_usd > 0) {
        itemVes = (item.precio_usd / meta.sum_precio_usd) * meta.total_ves
      } else {
        itemVes = item.precio_usd * (tx.tasa_aplicada ?? 1)
      }

      const comisionVes = item.comision_cobrada * (tx.tasa_aplicada ?? 1)
      const turno = meta?.turno ?? null

      const prev = ventasMap.get(item.producto_id) ?? {
        count: 0, count_t1: 0, count_t2: 0,
        ingreso_ves: 0, ingreso_ves_t1: 0, ingreso_ves_t2: 0,
        comision_ves: 0, comision_ves_t1: 0, comision_ves_t2: 0,
      }

      ventasMap.set(item.producto_id, {
        count:          prev.count + 1,
        count_t1:       prev.count_t1 + (turno === 1 ? 1 : 0),
        count_t2:       prev.count_t2 + (turno === 2 ? 1 : 0),
        ingreso_ves:    prev.ingreso_ves + itemVes,
        ingreso_ves_t1: prev.ingreso_ves_t1 + (turno === 1 ? itemVes : 0),
        ingreso_ves_t2: prev.ingreso_ves_t2 + (turno === 2 ? itemVes : 0),
        comision_ves:    prev.comision_ves + comisionVes,
        comision_ves_t1: prev.comision_ves_t1 + (turno === 1 ? comisionVes : 0),
        comision_ves_t2: prev.comision_ves_t2 + (turno === 2 ? comisionVes : 0),
      })
    }

    const filas: FilaLoteria[] = prodLoteria.map((prod: { id: string; nombre: string }) => {
      const agg = ventasMap.get(prod.id) ?? {
        count: 0, count_t1: 0, count_t2: 0,
        ingreso_ves: 0, ingreso_ves_t1: 0, ingreso_ves_t2: 0,
        comision_ves: 0, comision_ves_t1: 0, comision_ves_t2: 0,
      }
      return {
        producto_id:     prod.id,
        nombre:          prod.nombre,
        vendidos:        agg.count,
        vendidos_t1:     agg.count_t1,
        vendidos_t2:     agg.count_t2,
        ingreso_ves:     agg.ingreso_ves,
        ingreso_ves_t1:  agg.ingreso_ves_t1,
        ingreso_ves_t2:  agg.ingreso_ves_t2,
        comision_ves:    agg.comision_ves,
        comision_ves_t1: agg.comision_ves_t1,
        comision_ves_t2: agg.comision_ves_t2,
      }
    })

    const total_ventas_ves     = filas.reduce((s, f) => s + f.ingreso_ves, 0)
    const total_comisiones_ves = filas.reduce((s, f) => s + f.comision_ves, 0)

    return NextResponse.json({ filas, total_ventas_ves, total_comisiones_ves })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
