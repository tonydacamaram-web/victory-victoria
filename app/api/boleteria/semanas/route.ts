import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await supabase
      .from('semanas_boleteria')
      .select('*')
      .order('fecha_inicio', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Verificar que no haya otra semana abierta
    const { data: abierta } = await supabase
      .from('semanas_boleteria')
      .select('id')
      .eq('estado', 'abierta')
      .single()

    if (abierta) {
      return NextResponse.json({ error: 'Ya existe una semana abierta' }, { status: 409 })
    }

    // Calcular lunes y domingo de la semana actual
    const hoy = new Date()
    const diaSemana = hoy.getDay() // 0=dom, 1=lun ... 6=sab
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() + diffLunes)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)

    const toDate = (d: Date) => d.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('semanas_boleteria')
      .insert({
        fecha_inicio: toDate(lunes),
        fecha_fin: toDate(domingo),
        estado: 'abierta',
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
