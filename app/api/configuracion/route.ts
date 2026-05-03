import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('configuracion').select('clave, valor')
    if (error) throw error
    const config: Record<string, string> = {}
    for (const row of data ?? []) config[row.clave] = row.valor
    return NextResponse.json(config)
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { clave, valor } = body
    const { error } = await supabase
      .from('configuracion')
      .upsert({ clave, valor }, { onConflict: 'clave' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
