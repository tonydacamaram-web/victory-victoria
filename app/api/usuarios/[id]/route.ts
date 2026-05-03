import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const { nombre, username, email, password, rol } = await request.json()

    if (!nombre || !username || !email || !rol) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Actualizar tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .update({ nombre, username: username.toLowerCase(), email, rol })
      .eq('id', id)

    if (dbError) throw dbError

    // Actualizar email y/o password en Supabase Auth
    const authUpdate: { email?: string; password?: string } = {}
    if (email) authUpdate.email = email
    if (password && password.length >= 6) authUpdate.password = password

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdate)
      if (authError) throw authError
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    const { error } = await supabase.from('usuarios').update(body).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Eliminar de la tabla primero, luego de Auth
    const { error: dbError } = await supabase.from('usuarios').delete().eq('id', id)
    if (dbError) throw dbError

    const { error: authError } = await supabase.auth.admin.deleteUser(id)
    if (authError) throw authError

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
