import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: semana_id } = await params

    const { data, error } = await supabase
      .from('premios_boleteria')
      .select('*, producto:productos(nombre), boletos_producto:productos!boletos_producto_id(nombre), caja:cajas(turno)')
      .eq('semana_id', semana_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: semana_id } = await params
    const {
      caja_id, producto_id, tipo, moneda, monto, observaciones,
      fuente = 'caja', metodo_externo = null,
      boletos_producto_id = null, boletos_cantidad = null,
    } = await request.json()

    if (!caja_id || !tipo || !moneda || !monto) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    if (boletos_cantidad !== null && boletos_cantidad <= 0) {
      return NextResponse.json({ error: 'La cantidad de boletos debe ser mayor a cero' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('premios_boleteria')
      .insert({
        semana_id,
        caja_id,
        producto_id: producto_id || null,
        tipo,
        moneda,
        monto,
        observaciones: observaciones || null,
        fuente,
        metodo_externo: fuente === 'externo' ? metodo_externo : null,
        boletos_producto_id: tipo === 'mayor' ? (boletos_producto_id || null) : null,
        boletos_cantidad: tipo === 'mayor' ? (boletos_cantidad || null) : null,
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
