import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fechaVigenciaTasa } from '@/lib/utils/currency'

export async function GET() {
  try {
    const supabase = await createClient()
    const fechaBuscada = fechaVigenciaTasa()

    // Buscar tasa del día hábil correspondiente
    const { data: tasaHoy } = await supabase
      .from('tasas_cambio')
      .select('*')
      .eq('fecha_vigencia', fechaBuscada)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (tasaHoy) {
      return NextResponse.json({ ...tasaHoy, stale: false })
    }

    // Si no hay tasa del día, retornar la última disponible con flag stale
    const { data: ultimaTasa, error } = await supabase
      .from('tasas_cambio')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !ultimaTasa) {
      return NextResponse.json({ error: 'No hay tasa disponible' }, { status: 404 })
    }

    return NextResponse.json({ ...ultimaTasa, stale: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
