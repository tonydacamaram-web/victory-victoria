import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createClient as createDirectClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    // Obtener caja_id del cierre
    const { data: corte } = await supabase
      .from('cortes_caja').select('caja_id').eq('id', id).single()
    if (!corte) return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 })

    // Transacciones de esa caja — sistema viene vía productos.sistema_id
    const { data: transacciones } = await supabase
      .from('transacciones')
      .select(`
        tasa_aplicada,
        items:items_transaccion(
          precio_usd,
          producto:productos(
            sistema_id,
            sistema:sistemas_inventario(nombre),
            categoria:categorias(nombre)
          )
        )
      `)
      .eq('caja_id', corte.caja_id)
      .eq('anulada', false)

    type ProdRaw = {
      sistema_id: string | null
      sistema: { nombre: string } | null
      categoria: { nombre: string } | null
    }
    type ItemRaw = { precio_usd: number; producto: ProdRaw | null }
    type TxRaw = { tasa_aplicada: number; items: ItemRaw[] }

    const grupos = new Map<string, {
      sistema_id: string
      sistema_nombre: string
      categoria_nombre: string
      count: number
      total_usd: number
      total_ves: number
    }>()

    let tasaAcum = 0
    let tasaCount = 0

    for (const t of ((transacciones ?? []) as unknown as TxRaw[])) {
      const tasa = t.tasa_aplicada ?? 0
      if (tasa > 0) { tasaAcum += tasa; tasaCount++ }
      for (const item of (t.items ?? [])) {
        const prod = item.producto
        if (!prod) continue
        const key = prod.sistema_id ?? 'sin_sistema'
        const usd = item.precio_usd ?? 0
        const prev = grupos.get(key) ?? {
          sistema_id: key,
          sistema_nombre: prod.sistema?.nombre ?? 'Sin sistema',
          categoria_nombre: prod.categoria?.nombre ?? 'Sin categoría',
          count: 0,
          total_usd: 0,
          total_ves: 0,
        }
        prev.count += 1
        prev.total_usd += usd
        prev.total_ves += usd * tasa
        grupos.set(key, prev)
      }
    }

    const tasa = tasaCount > 0 ? tasaAcum / tasaCount : 0

    const sistemas = Array.from(grupos.values())
      .sort((a, b) =>
        a.categoria_nombre.localeCompare(b.categoria_nombre) ||
        a.sistema_nombre.localeCompare(b.sistema_nombre)
      )

    // Desglose de pagos por método
    const { data: txIds } = await supabase
      .from('transacciones')
      .select('id')
      .eq('caja_id', corte.caja_id)
      .eq('anulada', false)

    const ids = txIds?.map(t => t.id) ?? []
    const pagosRaw = ids.length > 0
      ? (await supabase.from('pagos_transaccion').select('metodo, monto, moneda').in('transaccion_id', ids)).data ?? []
      : []

    const pagosMap = new Map<string, { metodo: string; moneda: string; total: number; count: number }>()
    for (const p of pagosRaw) {
      const prev = pagosMap.get(p.metodo) ?? { metodo: p.metodo, moneda: p.moneda, total: 0, count: 0 }
      prev.total += p.monto
      prev.count += 1
      pagosMap.set(p.metodo, prev)
    }
    const pagos_por_metodo = Array.from(pagosMap.values())

    return NextResponse.json({ sistemas, tasa, pagos_por_metodo })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('usuarios').select('rol').eq('id', user.id).single()
    if (!['admin', 'supervisor'].includes(usuario?.rol ?? '')) {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar cierres' }, { status: 403 })
    }

    const { password } = await request.json()
    if (!password) return NextResponse.json({ error: 'Se requiere contraseña' }, { status: 400 })

    // Verificar contraseña con cliente directo (no SSR, no afecta sesión activa)
    const supabaseVerify = createDirectClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: authError } = await supabaseVerify.auth.signInWithPassword({
      email: user.email!,
      password,
    })
    if (authError) {
      return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
    }

    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin.from('cortes_caja').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
