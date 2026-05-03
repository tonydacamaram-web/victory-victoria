import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchBCVRate } from '@/lib/bcv/fetchRate'
import { fechaVigenciaTasa } from '@/lib/utils/currency'

export async function POST() {
  try {
    const { tasa, fuente } = await fetchBCVRate()
    const supabase = await createClient()

    const fecha_vigencia = fechaVigenciaTasa()

    const { data, error } = await supabase
      .from('tasas_cambio')
      .insert({ moneda: 'VES', tasa, fuente, fecha_vigencia })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    const status = message.includes('manualmente') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
