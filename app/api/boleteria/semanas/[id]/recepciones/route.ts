import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST — registrar recepciones de tickets
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: semana_id } = await params
    const { recepciones } = await request.json() as {
      recepciones: { producto_id: string; cantidad: number }[]
    }

    if (!recepciones?.length) {
      return NextResponse.json({ error: 'Se requieren recepciones' }, { status: 400 })
    }

    const rows = recepciones.map(r => ({
      semana_id,
      producto_id: r.producto_id,
      cantidad: r.cantidad,
    }))

    const { error } = await supabase
      .from('recepciones_boleteria')
      .upsert(rows, { onConflict: 'semana_id,producto_id' })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH — ajuste manual de vendidos (solo admin/supervisor)
export async function PATCH(
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
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id: semana_id } = await params
    const { ajustes } = await request.json() as {
      ajustes: { producto_id: string; vendidos_manual: number | null }[]
    }

    if (!ajustes?.length) {
      return NextResponse.json({ error: 'Se requieren ajustes' }, { status: 400 })
    }

    // UPDATE via admin client (bypasa RLS)
    const admin = createAdminClient()
    for (const aj of ajustes) {
      const { error } = await admin
        .from('recepciones_boleteria')
        .update({ vendidos_manual: aj.vendidos_manual })
        .eq('semana_id', semana_id)
        .eq('producto_id', aj.producto_id)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
