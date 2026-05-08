import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  const { data: configRows } = await supabase
    .from('configuracion')
    .select('clave, valor')
  const config: Record<string, string> = {}
  for (const row of configRows ?? []) config[row.clave] = row.valor
  const logoUrl = config['logo_url'] ?? ''

  const esAdmin = ['admin', 'supervisor'].includes(usuario?.rol ?? '')

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-5">
          {/* Logo */}
          <Link href="/pos" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded object-cover" />
            ) : (
              <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-bold text-sm">
                {(process.env.NEXT_PUBLIC_APP_NAME ?? 'L')[0]}
              </div>
            )}
            <span className="font-bold text-amber-400 text-sm hidden sm:block">
              {process.env.NEXT_PUBLIC_APP_NAME ?? 'LoteríaPlus'}
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link href="/pos" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">POS</Link>
            <Link href="/cortes" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Cortes</Link>
            <Link href="/reportes" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Reportes</Link>
            <Link href="/admin/cierres" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Cierres</Link>
            <Link href="/boleteria" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-amber-400 hover:bg-gray-800 transition-colors">Boletería</Link>
            <Link href="/loteria" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-amber-400 hover:bg-gray-800 transition-colors">Lotería</Link>
            {esAdmin && (
              <>
                <Link href="/admin/comisiones" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-amber-400 hover:bg-gray-800 transition-colors">Comisiones</Link>
                <Link href="/admin/inventario" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Inventario</Link>
                <Link href="/admin/productos" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Productos</Link>
                <Link href="/admin/categorias" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Categorías</Link>
                <Link href="/admin/usuarios" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Usuarios</Link>
                <Link href="/admin/tasas" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-emerald-400 hover:bg-gray-800 transition-colors">Tasas</Link>
                <Link href="/admin/configuracion" className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-amber-400 hover:bg-gray-800 transition-colors">Config</Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400 text-xs hidden sm:block">{usuario?.nombre ?? user.email}</span>
          <span className="bg-emerald-900 text-emerald-400 px-2 py-0.5 rounded text-xs uppercase font-medium border border-emerald-700">
            {usuario?.rol}
          </span>
          <form action="/api/auth/signout" method="post">
            <button className="text-gray-500 hover:text-red-400 text-xs transition-colors">Salir</button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
