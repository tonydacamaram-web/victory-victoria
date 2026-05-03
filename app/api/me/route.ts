import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data } = await supabase
      .from('usuarios')
      .select('id, rol, nombre')
      .eq('id', user.id)
      .single()

    return NextResponse.json(data ?? null)
  } catch {
    return NextResponse.json(null)
  }
}
