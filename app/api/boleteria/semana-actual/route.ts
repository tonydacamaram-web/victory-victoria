import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FilaArqueoLoteria } from '@/types'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Buscar semana abierta
    const { data: semana } = await supabase
      .from('semanas_boleteria')
      .select('*')
      .eq('estado', 'abierta')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .single()

    if (!semana) return NextResponse.json({ semana: null, filas: [], premios: [], total_premios_usd: 0, total_premios_ves: 0 })

    // Productos de la categoría "Boleteria"
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, moneda_precio, precio_usd, costo_usd, comision_usd, precio_ves, costo_ves, comision_ves, categoria:categorias(nombre)')
      .eq('activo', true)
      .eq('categorias.nombre', 'Boleteria')

    // Filtrar solo los que pertenecen a esa categoría
    // Supabase infiere categoria como array en joins con alias, usamos unknown para evitar conflictos
    const prodLoteria = (productos ?? []).filter((p) => {
      const cat = p.categoria
      if (Array.isArray(cat)) return cat[0]?.nombre === 'Boleteria'
      return (cat as { nombre?: string } | null)?.nombre === 'Boleteria'
    })

    if (prodLoteria.length === 0) return NextResponse.json({ semana, filas: [], premios: [], total_premios_usd: 0, total_premios_ves: 0 })

    const productoIds = prodLoteria.map((p: { id: string }) => p.id)

    // Recepciones de esa semana (incluye ajuste manual de vendidos si lo hay)
    const { data: recepciones } = await supabase
      .from('recepciones_boleteria')
      .select('producto_id, cantidad, vendidos_manual')
      .eq('semana_id', semana.id)

    const recepcionMap = new Map<string, number>()
    const vendidosManualMap = new Map<string, number>()
    for (const r of (recepciones ?? [])) {
      recepcionMap.set(r.producto_id, r.cantidad)
      if (r.vendidos_manual !== null && r.vendidos_manual !== undefined) {
        vendidosManualMap.set(r.producto_id, r.vendidos_manual)
      }
    }

    // Ventas del período: items_transaccion de productos de boletería en el rango de fechas
    // Nota: se usa el mismo patrón que semanas/[id]/ventas/route.ts
    // El filtro .eq('transacciones.anulada', false) se aplica en JS para evitar
    // comportamientos silenciosos del join embebido con múltiples filtros en PostgREST
    const fechaInicio = semana.fecha_inicio + 'T00:00:00+00:00'
    const fechaFin    = semana.fecha_fin    + 'T23:59:59+00:00'

    const { data: items, error: itemsErr } = await supabase
      .from('items_transaccion')
      .select('producto_id, precio_usd, transaccion:transacciones!inner(id, anulada, created_at, total_usd)')
      .in('producto_id', productoIds)
      .gte('transacciones.created_at', fechaInicio)
      .lte('transacciones.created_at', fechaFin)

    if (itemsErr) {
      console.error('[boleteria/semana-actual] Error en query items_transaccion:', itemsErr)
    }

    // Agrupar por transacción para aplicar inferencia de cantidad en registros pre-fix
    type TxMeta = { anulada: boolean; total_usd: number; productos: Map<string, { filas: number; precio_usd: number }> }
    const txMetaMap = new Map<string, TxMeta>()

    for (const item of (items ?? [])) {
      const raw = item.transaccion as unknown as { id: string; anulada: boolean; created_at: string; total_usd: number } | { id: string; anulada: boolean; created_at: string; total_usd: number }[] | null
      const t = Array.isArray(raw) ? raw[0] : raw
      if (!t || t.anulada) continue

      if (!txMetaMap.has(t.id)) {
        txMetaMap.set(t.id, { anulada: t.anulada, total_usd: t.total_usd ?? 0, productos: new Map() })
      }
      const meta = txMetaMap.get(t.id)!
      const prev = meta.productos.get(item.producto_id)
      meta.productos.set(item.producto_id, {
        filas:     (prev?.filas ?? 0) + 1,
        precio_usd: item.precio_usd,
      })
    }

    const ventasMap = new Map<string, number>()
    for (const [, tx] of txMetaMap) {
      for (const [prod_id, p] of tx.productos) {
        let cantidad = p.filas
        // Inferencia: transacción de un solo producto boletería + total encaja con múltiplo
        if (tx.productos.size === 1 && p.precio_usd > 0) {
          const inferido = Math.round(tx.total_usd / p.precio_usd)
          if (inferido > p.filas) cantidad = inferido
        }
        ventasMap.set(prod_id, (ventasMap.get(prod_id) ?? 0) + cantidad)
      }
    }

    // Construir filas
    const filas: FilaArqueoLoteria[] = prodLoteria.map((prod: {
      id: string
      nombre: string
      moneda_precio: 'USD' | 'VES'
      precio_usd: number
      costo_usd: number
      comision_usd: number
      precio_ves: number | null
      costo_ves: number | null
      comision_ves: number | null
    }) => {
      const esUSD = prod.moneda_precio === 'USD'
      const precio   = esUSD ? prod.precio_usd    : (prod.precio_ves   ?? 0)
      const costo    = esUSD ? prod.costo_usd     : (prod.costo_ves    ?? 0)
      const comision = esUSD ? prod.comision_usd  : (prod.comision_ves ?? 0)
      const comision_pct = precio > 0 ? (comision / precio) * 100 : 0
      const recibidos       = recepcionMap.get(prod.id) ?? 0
      const vendidosCalc    = ventasMap.get(prod.id) ?? 0
      const vendidosManual  = vendidosManualMap.get(prod.id)
      const vendidos        = vendidosManual !== undefined ? vendidosManual : vendidosCalc
      const disponibles     = recibidos - vendidos

      return {
        producto_id:     prod.id,
        nombre:          prod.nombre,
        moneda:          prod.moneda_precio,
        precio,
        costo,
        comision,
        comision_pct,
        recibidos,
        vendidos,
        vendidos_calculado: vendidosCalc,
        vendidos_manual:    vendidosManual ?? null,
        boletos_entregados: 0,
        disponibles,
        ingreso_bruto:   precio   * vendidos,
        comision_total:  comision * vendidos,
        deuda_proveedor: costo    * vendidos,
      }
    })

    // Premios pagados en esta semana
    const { data: premios } = await supabase
      .from('premios_boleteria')
      .select('*, producto:productos(nombre), boletos_producto:productos!boletos_producto_id(nombre), caja:cajas(turno)')
      .eq('semana_id', semana.id)
      .order('created_at', { ascending: false })

    const total_premios_usd = (premios ?? []).filter(p => p.moneda === 'USD').reduce((s, p) => s + p.monto, 0)
    const total_premios_ves = (premios ?? []).filter(p => p.moneda === 'VES').reduce((s, p) => s + p.monto, 0)

    return NextResponse.json({ semana, filas, premios: premios ?? [], total_premios_usd, total_premios_ves })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
