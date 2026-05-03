import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET /api/loteria/premios?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')

    let query = supabase
      .from('premios_loteria')
      .select('*, producto:productos(nombre), caja:cajas(turno, usuario_id)')
      .order('created_at', { ascending: false })

    if (desde) query = query.gte('created_at', desde + 'T00:00:00')
    if (hasta) query = query.lte('created_at', hasta + 'T23:59:59')

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/loteria/premios
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const {
      caja_id, producto_id, moneda, monto, numero_ticket, observaciones,
      fuente = 'caja', metodo_externo = null,
    } = await request.json()

    if (!caja_id || !producto_id || !moneda || !monto || !numero_ticket) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('premios_loteria')
      .insert({
        semana_id: null,
        caja_id,
        producto_id,
        tipo: 'mayor',
        moneda,
        monto,
        numero_ticket,
        observaciones: observaciones || null,
        fuente,
        metodo_externo: fuente === 'externo' ? metodo_externo : null,
        modulo: 'loteria',
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
