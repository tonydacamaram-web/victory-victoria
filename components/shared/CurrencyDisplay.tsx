'use client'

import { formatUSD, formatVES, usdToVes } from '@/lib/utils/currency'

interface Props {
  usd: number
  tasa: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CurrencyDisplay({ usd, tasa, className = '', size = 'md' }: Props) {
  const ves = usdToVes(usd, tasa)

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const usdClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-semibold',
    lg: 'text-lg font-bold',
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <span className={`text-green-700 ${usdClasses[size]}`}>{formatUSD(usd)}</span>
      <span className={`text-gray-500 ${sizeClasses[size]}`}>{formatVES(ves)}</span>
    </div>
  )
}
