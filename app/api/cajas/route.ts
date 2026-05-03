import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Retorna la caja abierta del usuario actual
    const { data } = await supabase
      .from('cajas')
      .select('*')
      .eq('estado', 'abierta')
      .eq('usuario_id', user.id)
      .single()

    return NextResponse.json(data ?? null)
  } catch {
    return NextResponse.json(null)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { saldo_apertura_usd, saldo_apertura_ves, turno } = await request.json()

    // Verificar que este usuario no tenga ya una caja abierta
    const { data: cajaActiva } = await supabase
      .from('cajas')
      .select('id')
      .eq('estado', 'abierta')
      .eq('usuario_id', user.id)
      .single()

    if (cajaActiva) {
      return NextResponse.json({ error: 'Ya tienes una caja abierta' }, { status: 409 })
    }

    // Usar el nombre del usuario como nombre de la caja para identificarla en reportes
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('nombre')
      .eq('id', user.id)
      .single()

    const nombreCaja = usuarioData?.nombre ? `Caja – ${usuarioData.nombre}` : 'Caja'

    const { data, error } = await supabase
      .from('cajas')
      .insert({
        nombre: nombreCaja,
        usuario_id: user.id,
        saldo_apertura_usd: saldo_apertura_usd ?? 0,
        saldo_apertura_ves: saldo_apertura_ves ?? 0,
        estado: 'abierta',
        turno: turno === 2 ? 2 : 1,
        turno_inicio: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message
      : (err as { message?: string })?.message ?? JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
