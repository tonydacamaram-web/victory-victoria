'use client'

import { useState, useEffect } from 'react'
import { Usuario, Rol } from '@/types'

const ROLES: Rol[] = ['admin', 'supervisor', 'cajero', 'auditor']

type FormNuevo = { nombre: string; username: string; email: string; password: string; rol: Rol }
type FormEditar = { nombre: string; username: string; email: string; password: string; rol: Rol }

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [form, setForm] = useState<FormNuevo>({ nombre: '', username: '', email: '', password: '', rol: 'cajero' })
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<(Usuario & { username?: string }) | null>(null)
  const [formEditar, setFormEditar] = useState<FormEditar>({ nombre: '', username: '', email: '', password: '', rol: 'cajero' })
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const res = await fetch('/api/usuarios')
    if (res.ok) setUsuarios(await res.json())
  }

  function mostrarMensaje(texto: string, tipo: 'ok' | 'error') {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }

  function abrirEditar(u: Usuario & { username?: string }) {
    setEditando(u)
    setFormEditar({ nombre: u.nombre, username: u.username ?? '', email: u.email, password: '', rol: u.rol })
    setMostrarForm(false)
  }

  function cerrarEditar() {
    setEditando(null)
    setFormEditar({ nombre: '', username: '', email: '', password: '', rol: 'cajero' })
  }

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      mostrarMensaje('Usuario creado correctamente', 'ok')
      setForm({ nombre: '', username: '', email: '', password: '', rol: 'cajero' })
      setMostrarForm(false)
      cargar()
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al crear usuario', 'error')
    }
    setCargando(false)
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setCargando(true)
    const res = await fetch(`/api/usuarios/${editando.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formEditar),
    })
    if (res.ok) {
      mostrarMensaje('Usuario actualizado correctamente', 'ok')
      cerrarEditar()
      cargar()
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al actualizar usuario', 'error')
    }
    setCargando(false)
  }

  async function toggleActivo(u: Usuario) {
    await fetch(`/api/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !u.activo }),
    })
    cargar()
  }

  async function eliminarUsuario(id: string) {
    setCargando(true)
    const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
    if (res.ok) {
      mostrarMensaje('Usuario eliminado', 'ok')
      cargar()
    } else {
      const d = await res.json()
      mostrarMensaje(d.error ?? 'Error al eliminar', 'error')
    }
    setConfirmEliminar(null)
    setCargando(false)
  }

  const inputCls = "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">Usuarios</h1>
        <button onClick={() => { setMostrarForm(true); cerrarEditar() }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
          + Nuevo usuario
        </button>
      </div>

      {mensaje && (
        <div className={`rounded-lg px-4 py-2 text-sm border ${mensaje.tipo === 'ok' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' : 'bg-red-900/40 text-red-300 border-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario nuevo usuario */}
      {mostrarForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-100 mb-4">Nuevo usuario</h2>
          <form onSubmit={crearUsuario} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Nombre completo</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className={inputCls} placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Usuario</label>
                <input type="text" required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  className={inputCls} placeholder="cajero1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Email</label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className={inputCls} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Contraseña</label>
                <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className={inputCls} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Rol</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))}
                  className={inputCls}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={cargando}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {cargando ? 'Creando...' : 'Crear usuario'}
              </button>
              <button type="button" onClick={() => setMostrarForm(false)}
                className="border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Formulario editar usuario */}
      {editando && (
        <div className="bg-gray-900 border border-emerald-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Editar usuario — <span className="text-emerald-400">{editando.nombre}</span></h2>
            <button onClick={cerrarEditar} className="text-gray-400 hover:text-gray-200 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={guardarEdicion} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Nombre completo</label>
                <input type="text" required value={formEditar.nombre} onChange={e => setFormEditar(f => ({ ...f, nombre: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Usuario</label>
                <input type="text" required value={formEditar.username} onChange={e => setFormEditar(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Email</label>
                <input type="email" required value={formEditar.email} onChange={e => setFormEditar(f => ({ ...f, email: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Nueva contraseña <span className="text-gray-500 font-normal">(dejar vacío para no cambiar)</span></label>
                <input type="password" minLength={6} value={formEditar.password} onChange={e => setFormEditar(f => ({ ...f, password: e.target.value }))}
                  className={inputCls} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-300 block mb-1">Rol</label>
                <select value={formEditar.rol} onChange={e => setFormEditar(f => ({ ...f, rol: e.target.value as Rol }))}
                  className={inputCls}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={cargando}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {cargando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={cerrarEditar}
                className="border border-gray-600 px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Usuario</th>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-300">Rol</th>
              <th className="text-center px-4 py-3 font-medium text-gray-300">Estado</th>
              <th className="text-center px-4 py-3 font-medium text-gray-300" colSpan={3}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {usuarios.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Sin usuarios</td></tr>
            )}
            {usuarios.map(u => (
              <tr key={u.id} className={`hover:bg-gray-800 ${!u.activo ? 'opacity-50' : ''} ${editando?.id === u.id ? 'bg-emerald-900/20' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-100">{u.nombre}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{(u as any).username ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">{u.email}</td>
                <td className="px-4 py-3 text-gray-300 capitalize">{u.rol}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActivo(u)}
                    className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${u.activo ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700 hover:bg-emerald-900' : 'bg-gray-800 text-gray-500 border border-gray-600 hover:bg-gray-700'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-2 py-3 text-center">
                  <button onClick={() => abrirEditar(u as any)}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors">
                    Editar
                  </button>
                </td>
                <td className="px-2 py-3 text-center">
                  {confirmEliminar === u.id ? (
                    <div className="flex items-center gap-1 justify-center">
                      <span className="text-xs text-red-400 font-medium">¿Eliminar?</span>
                      <button onClick={() => eliminarUsuario(u.id)} disabled={cargando}
                        className="text-xs px-2 py-1 rounded bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 transition-colors">
                        Sí
                      </button>
                      <button onClick={() => setConfirmEliminar(null)}
                        className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-400 hover:bg-gray-700 transition-colors">
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmEliminar(u.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors">
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
