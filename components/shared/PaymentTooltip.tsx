import { MetodoPago, PagoTransaccion } from '@/types'
import { MethodBadge } from './MethodBadge'
import { formatUSD, formatVES } from '@/lib/utils/currency'

const REFERENCIA_LABEL: Partial<Record<MetodoPago, string>> = {
  pago_movil:          'Teléfono',
  transferencia_ves:   'Comprobante',
  banesco_pos:         'Aprobación',
  zelle:               'ID Zelle',
  binance:             'ID Binance',
  billetera_digital_usd: 'Comprobante',
  vale:                'A nombre de',
}

interface Props {
  metodo: MetodoPago
  pago: PagoTransaccion | undefined
}

export function PaymentTooltip({ metodo, pago }: Props) {
  if (!pago) return <MethodBadge metodo={metodo} />

  const monto = pago.moneda === 'VES'
    ? formatVES(pago.monto)
    : formatUSD(pago.monto)

  const refLabel = REFERENCIA_LABEL[metodo]

  return (
    <div className="relative group inline-block">
      <MethodBadge metodo={metodo} />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                      invisible group-hover:visible opacity-0 group-hover:opacity-100
                      transition-opacity duration-150 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-2 whitespace-nowrap shadow-lg space-y-0.5 min-w-max">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Monto</span>
            <span className="font-semibold">{monto}</span>
          </div>
          {refLabel && pago.referencia && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{refLabel}</span>
              <span className="font-semibold">{pago.referencia}</span>
            </div>
          )}
          {metodo === 'biopago' && (
            <div className="text-yellow-300 text-xs">Confirmado en dispositivo</div>
          )}
        </div>
        {/* Flecha */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}
