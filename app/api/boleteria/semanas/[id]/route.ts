import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const {
      estado, notas,
      cierre_recibidos_usd, cierre_vendidos_usd, cierre_ingreso_usd, cierre_comision_usd, cierre_deuda_usd, cierre_premios_usd,
      cierre_recibidos_ves, cierre_vendidos_ves, cierre_ingreso_ves, cierre_comision_ves, cierre_deuda_ves, cierre_premios_ves,
    } = body as Record<string, unknown>

    const update: Record<string, unknown> = {}
    if (estado) update.estado = estado
    if (notas !== undefined) update.notas = notas
    if (cierre_recibidos_usd !== undefined) update.cierre_recibidos_usd = cierre_recibidos_usd
    if (cierre_vendidos_usd  !== undefined) update.cierre_vendidos_usd  = cierre_vendidos_usd
    if (cierre_ingreso_usd   !== undefined) update.cierre_ingreso_usd   = cierre_ingreso_usd
    if (cierre_comision_usd  !== undefined) update.cierre_comision_usd  = cierre_comision_usd
    if (cierre_deuda_usd     !== undefined) update.cierre_deuda_usd     = cierre_deuda_usd
    if (cierre_premios_usd   !== undefined) update.cierre_premios_usd   = cierre_premios_usd
    if (cierre_recibidos_ves !== undefined) update.cierre_recibidos_ves = cierre_recibidos_ves
    if (cierre_vendidos_ves  !== undefined) update.cierre_vendidos_ves  = cierre_vendidos_ves
    if (cierre_ingreso_ves   !== undefined) update.cierre_ingreso_ves   = cierre_ingreso_ves
    if (cierre_comision_ves  !== undefined) update.cierre_comision_ves  = cierre_comision_ves
    if (cierre_deuda_ves     !== undefined) update.cierre_deuda_ves     = cierre_deuda_ves
    if (cierre_premios_ves   !== undefined) update.cierre_premios_ves   = cierre_premios_ves

    const { data, error } = await supabase
      .from('semanas_boleteria')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
