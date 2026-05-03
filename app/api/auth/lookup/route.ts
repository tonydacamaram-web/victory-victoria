import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'Falta username' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select('email')
    .eq('username', username.toLowerCase())
    .eq('activo', true)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  return NextResponse.json({ email: data.email })
}
