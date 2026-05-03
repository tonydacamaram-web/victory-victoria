'use client'

import { TasaCambio } from '@/types'
import { formatVES } from '@/lib/utils/currency'

interface Props {
  tasa: TasaCambio | null
  onCargarTasa?: () => void
}

export function RateBar({ tasa, onCargarTasa }: Props) {
  if (!tasa) {
    return (
      <div className="flex items-center justify-between bg-red-950 border border-red-700 rounded-lg px-4 py-2">
        <span className="text-red-400 text-sm font-medium">⚠️ Sin tasa BCV del día</span>
        {onCargarTasa && (
          <button onClick={onCargarTasa} className="bg-red-700 text-white text-xs px-3 py-1 rounded hover:bg-red-600 transition-colors">
            Cargar tasa BCV
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-2 ${
      tasa.stale ? 'bg-amber-950 border border-amber-700' : 'bg-emerald-950 border border-emerald-700'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-300">Tasa BCV:</span>
        <span className="text-sm font-bold text-amber-400">{formatVES(tasa.tasa)} / USD</span>
        <span className="text-xs text-gray-500 uppercase bg-gray-800 px-1.5 py-0.5 rounded border border-gray-600">
          {tasa.fuente}
        </span>
        {tasa.stale && (
          <span className="text-xs text-amber-400 font-medium">⚠️ Tasa del {tasa.fecha_vigencia}</span>
        )}
      </div>
      {onCargarTasa && (
        <button onClick={onCargarTasa} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
          Actualizar
        </button>
      )}
    </div>
  )
}
