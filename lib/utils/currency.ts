/**
 * Convierte USD a VES usando la tasa vigente
 */
export function usdToVes(usd: number, tasa: number): number {
  return Math.round(usd * tasa * 100) / 100
}

/**
 * Convierte VES a USD usando la tasa vigente.
 * Se preservan 10 decimales para que la reconversión a VES sea exacta.
 */
export function vesToUsd(ves: number, tasa: number): number {
  if (tasa === 0) return 0
  return Math.round((ves / tasa) * 10_000_000_000) / 10_000_000_000
}

/**
 * Retorna la fecha de vigencia correcta para la tasa:
 * - Lunes a viernes → hoy
 * - Sábado → próximo lunes
 * - Domingo → próximo lunes
 */
export function fechaVigenciaTasa(): string {
  const hoy = new Date()
  const dia = hoy.getDay() // 0=Dom, 6=Sab
  if (dia === 6) hoy.setDate(hoy.getDate() + 2) // sábado → lunes
  if (dia === 0) hoy.setDate(hoy.getDate() + 1) // domingo → lunes
  return hoy.toISOString().split('T')[0]
}

/**
 * Formatea un número como USD
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formatea un número como VES (bolívares)
 */
export function formatVES(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formatea mostrando ambas monedas
 */
export function formatDual(usd: number, tasa: number): { usd: string; ves: string } {
  return {
    usd: formatUSD(usd),
    ves: formatVES(usdToVes(usd, tasa)),
  }
}
