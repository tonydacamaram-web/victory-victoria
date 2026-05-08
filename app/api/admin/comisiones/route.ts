import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (!['admin', 'supervisor'].includes(usuario?.rol ?? '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    let txQuery = supabase
      .from('transacciones')
      .select('id, comision_total_usd, total_usd, total_ves, tasa_aplicada, moneda_cobro')
      .eq('anulada', false)
      .order('created_at', { ascending: false })

    if (desde) txQuery = txQuery.gte('created_at', desde)
    if (hasta) txQuery = txQuery.lte('created_at', hasta + 'T23:59:59')

    const { data: txs, error: txErr } = await txQuery
    if (txErr) throw txErr

    const vacío = {
      totales: { total_usd: 0, comision_usd: 0, num_transacciones: 0, tasa_promedio: 0 },
      por_metodo: [], por_categoria: [], por_producto: [],
    }
    if (!txs || txs.length === 0) return NextResponse.json(vacío)

    const txIds = txs.map(t => t.id)

    // Pagos y items en paralelo
    const [{ data: pagos }, { data: items }] = await Promise.all([
      supabase
        .from('pagos_transaccion')
        .select('transaccion_id, metodo, moneda, monto')
        .in('transaccion_id', txIds),
      supabase
        .from('items_transaccion')
        .select('transaccion_id, precio_usd, comision_cobrada, producto:productos(nombre, categoria:categorias(nombre))')
        .in('transaccion_id', txIds),
    ])

    // ── Totales globales ──────────────────────────────────────────
    // total_usd y total_ves son las porciones cobradas en cada moneda;
    // se convierten juntas a USD usando la tasa de cada transacción.
    const total_usd = txs.reduce((s, t) => {
      const usd = t.total_usd ?? 0
      const ves = t.tasa_aplicada > 0 ? (t.total_ves ?? 0) / t.tasa_aplicada : 0
      return s + usd + ves
    }, 0)
    const comision_usd = txs.reduce((s, t) => s + (t.comision_total_usd ?? 0), 0)
    const tasa_promedio = txs.reduce((s, t) => s + (t.tasa_aplicada ?? 0), 0) / txs.length

    // ── Por método ───────────────────────────────────────────────
    type TxEntry = typeof txs[0] & { pagos: NonNullable<typeof pagos> }
    const txMap = new Map<string, TxEntry>(
      txs.map(t => [t.id, { ...t, pagos: [] }])
    )
    for (const p of pagos ?? []) txMap.get(p.transaccion_id)?.pagos.push(p)

    type MetodoEntry = { metodo: string; total_usd: number; total_ves: number; num_ops: number; comision_usd: number }
    const metodosMap = new Map<string, MetodoEntry>()

    for (const tx of txMap.values()) {
      const txPagos = tx.pagos
      if (!txPagos.length) continue

      const pagosUsd = txPagos.map(p => ({
        ...p,
        monto_usd: p.moneda === 'USD' ? p.monto : (tx.tasa_aplicada > 0 ? p.monto / tx.tasa_aplicada : 0),
      }))
      const totalUsdPagos = pagosUsd.reduce((s, p) => s + p.monto_usd, 0)

      for (const p of pagosUsd) {
        if (!metodosMap.has(p.metodo)) {
          metodosMap.set(p.metodo, { metodo: p.metodo, total_usd: 0, total_ves: 0, num_ops: 0, comision_usd: 0 })
        }
        const entry = metodosMap.get(p.metodo)!
        entry.num_ops += 1
        if (p.moneda === 'USD') entry.total_usd += p.monto
        else entry.total_ves += p.monto
        const proporcion = totalUsdPagos > 0 ? p.monto_usd / totalUsdPagos : 1 / txPagos.length
        entry.comision_usd += (tx.comision_total_usd ?? 0) * proporcion
      }
    }

    const por_metodo = Array.from(metodosMap.values())
      .map(m => ({ ...m, comision_usd: Math.round(m.comision_usd * 10000) / 10000 }))
      .sort((a, b) => (b.total_usd + b.total_ves / tasa_promedio) - (a.total_usd + a.total_ves / tasa_promedio))

    // ── Por categoría ────────────────────────────────────────────
    type CatEntry = { categoria: string; total_usd: number; comision_usd: number; num_ventas: number }
    const catMap = new Map<string, CatEntry>()
    for (const item of items ?? []) {
      const cat = (item.producto as { categoria?: { nombre?: string } } | null)?.categoria?.nombre ?? 'Sin categoría'
      if (!catMap.has(cat)) catMap.set(cat, { categoria: cat, total_usd: 0, comision_usd: 0, num_ventas: 0 })
      const e = catMap.get(cat)!
      e.total_usd += item.precio_usd ?? 0
      e.comision_usd += item.comision_cobrada ?? 0
      e.num_ventas += 1
    }
    const por_categoria = Array.from(catMap.values()).sort((a, b) => b.comision_usd - a.comision_usd)

    // ── Por producto ─────────────────────────────────────────────
    type ProdEntry = { producto: string; categoria: string; total_usd: number; comision_usd: number; num_ventas: number }
    const prodMap = new Map<string, ProdEntry>()
    for (const item of items ?? []) {
      const prod = (item.producto as { nombre?: string } | null)?.nombre ?? 'Desconocido'
      const cat = (item.producto as { categoria?: { nombre?: string } } | null)?.categoria?.nombre ?? 'Sin categoría'
      const key = `${cat}::${prod}`
      if (!prodMap.has(key)) prodMap.set(key, { producto: prod, categoria: cat, total_usd: 0, comision_usd: 0, num_ventas: 0 })
      const e = prodMap.get(key)!
      e.total_usd += item.precio_usd ?? 0
      e.comision_usd += item.comision_cobrada ?? 0
      e.num_ventas += 1
    }
    const por_producto = Array.from(prodMap.values())
      .sort((a, b) => b.comision_usd - a.comision_usd)
      .slice(0, 100)

    return NextResponse.json({
      totales: {
        total_usd: Math.round(total_usd * 10000) / 10000,
        comision_usd: Math.round(comision_usd * 10000) / 10000,
        num_transacciones: txs.length,
        tasa_promedio: Math.round(tasa_promedio * 100) / 100,
      },
      por_metodo,
      por_categoria,
      por_producto,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
