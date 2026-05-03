import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const sistema_id = searchParams.get('sistema_id')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    let query = supabase
      .from('movimientos_inventario')
      .select('*, sistema:sistemas_inventario(id, nombre, tipo), usuario:usuarios(nombre)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (sistema_id) query = query.eq('sistema_id', sistema_id)
    if (desde) query = query.gte('created_at', desde)
    if (hasta) query = query.lte('created_at', hasta)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
