import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('nombre')
    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { nombre, username, email, password, rol } = await request.json()

    if (!nombre || !username || !email || !password || !rol) {
      return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
    }

    // Crear en Supabase Auth con service role
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw authError

    // Insertar en tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .insert({ id: authData.user.id, nombre, username: username.toLowerCase(), email, rol, activo: true })

    if (dbError) {
      // Revertir creación en Auth si falla la BD
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
