import { MetodoPago, METODOS_DIVISAS } from '@/types'

const LABELS: Record<MetodoPago, string> = {
  efectivo_usd: 'Efectivo USD',
  efectivo_ves: 'Efectivo Bs.',
  pago_movil: 'Pago Móvil',
  transferencia_ves: 'Transferencia',
  banesco_pos: 'POS Banesco',
  biopago: 'Biopago',
  zelle: 'Zelle',
  binance: 'Binance',
  billetera_digital_usd: 'Billetera Digital',
  vale: 'Vale',
}

interface Props {
  metodo: MetodoPago
}

export function MethodBadge({ metodo }: Props) {
  const esDivisas = METODOS_DIVISAS.includes(metodo)

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        esDivisas
          ? 'bg-green-100 text-green-800'
          : 'bg-blue-100 text-blue-800'
      }`}
    >
      {LABELS[metodo]}
    </span>
  )
}
