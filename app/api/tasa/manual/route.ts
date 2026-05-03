import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fechaVigenciaTasa } from '@/lib/utils/currency'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Verificar rol
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (!usuario || !['admin', 'supervisor'].includes(usuario.rol)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { tasa, observacion } = body

    if (!tasa || typeof tasa !== 'number' || tasa <= 0) {
      return NextResponse.json({ error: 'Tasa inválida' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tasas_cambio')
      .insert({
        moneda: 'VES',
        tasa,
        fuente: 'manual',
        fecha_vigencia: fechaVigenciaTasa(),
        ...(observacion && { observaciones: observacion }),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
