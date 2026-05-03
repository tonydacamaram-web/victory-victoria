import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/boleteria/premios?caja_id=xxx
// Devuelve premios de esa caja (para uso en cortes)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const caja_id = request.nextUrl.searchParams.get('caja_id')

    let query = supabase
      .from('premios_boleteria')
      .select('*, producto:productos(nombre), caja:cajas(turno)')
      .order('created_at', { ascending: false })

    if (caja_id) {
      query = query.eq('caja_id', caja_id)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
