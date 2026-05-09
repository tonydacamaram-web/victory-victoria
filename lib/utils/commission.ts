import { MetodoPago, METODOS_DIVISAS, Producto } from '@/types'

/**
 * Regla 1: determina si un método de pago es en divisas (sin comisión)
 */
export function esPagoEnDivisas(metodo: MetodoPago): boolean {
  return METODOS_DIVISAS.includes(metodo)
}

/**
 * Calcula el precio e info de comisión de un producto según el método de pago.
 *
 * Regla de moneda fija:
 * - Si moneda_precio = 'VES': los precios en Bs. son fijos (no cambian con la tasa).
 *   El equivalente USD se deriva dividiendo por la tasa actual.
 * - Si moneda_precio = 'USD': los precios en USD son fijos.
 *   El equivalente VES se deriva multiplicando por la tasa actual.
 */
export function calcularPrecioItem(
  producto: Producto,
  metodoPago: MetodoPago,
  tasa: number,
  montoLibreUsd?: number,
  montoLibreVes?: number
) {
  // ¿La categoría exime de comisión?
  const categoriaCobraComision = producto.categoria?.cobra_comision !== false

  // Monto variable — la comisión depende del método de pago, no de la moneda ingresada
  if (producto.monto_variable) {
    const vesAmt = montoLibreVes ?? 0
    if (vesAmt > 0) {
      if (esPagoEnDivisas(metodoPago)) {
        // Pago en divisas → sin comisión, convertir Bs. a USD
        const precioUsd = tasa > 0 ? vesAmt / tasa : 0
        return { precio_usd: precioUsd, comision: 0, precio_ves: vesAmt, moneda: 'USD' as const }
      } else if (categoriaCobraComision) {
        // comision_pct es solo para contabilidad interna — no afecta el precio al cliente
        if (producto.cobra_comision_fija !== false) {
          const precioVes = Math.round(vesAmt * 1.20 * 100) / 100
          const comisionVes = Math.round(vesAmt * 0.20 * 100) / 100
          const precioUsd = tasa > 0 ? precioVes / tasa : 0
          const comisionUsd = tasa > 0 ? comisionVes / tasa : 0
          return { precio_usd: precioUsd, comision: comisionUsd, precio_ves: precioVes, moneda: 'VES' as const }
        }
        const precioUsd = tasa > 0 ? vesAmt / tasa : 0
        return { precio_usd: precioUsd, comision: 0, precio_ves: vesAmt, moneda: 'VES' as const }
      } else {
        const precioUsd = tasa > 0 ? vesAmt / tasa : 0
        return { precio_usd: precioUsd, comision: 0, precio_ves: vesAmt, moneda: 'VES' as const }
      }
    }
    // Monto en USD (retrocompatibilidad) → sin comisión
    const monto = montoLibreUsd ?? 0
    return { precio_usd: monto, comision: 0, precio_ves: monto * tasa, moneda: 'USD' as const }
  }

  const precioFijoVes = producto.moneda_precio === 'VES'
  const costoIndexadoUsd = producto.costo_indexado_usd === true

  // Producto VES con costo indexado en USD (ej. cigarros):
  // el precio de venta es fijo en Bs. pero el costo está anclado al USD,
  // por lo que la comisión es dinámica según la tasa del día.
  if (precioFijoVes && costoIndexadoUsd) {
    const precioVes = producto.precio_ves ?? 0
    const costoUsd = producto.costo_usd ?? 0
    if (esPagoEnDivisas(metodoPago)) {
      // En divisas → cobra el costo real en USD, sin comisión
      return { precio_usd: costoUsd, comision: 0, precio_ves: tasa > 0 ? costoUsd * tasa : 0, moneda: 'USD' as const }
    }
    // En bolívares → comisión = (precio_ves / tasa) - costo_usd (varía cada día con la tasa)
    const precioUsd = tasa > 0 ? precioVes / tasa : 0
    const comisionUsd = Math.max(0, precioUsd - costoUsd)
    return { precio_usd: precioUsd, comision: comisionUsd, precio_ves: precioVes, moneda: 'VES' as const }
  }

  // Si la categoría no cobra comisión, o si el producto es de precio VES y se paga en divisas,
  // cobrar solo el costo (sin comisión). Para productos con precio fijo en USD, la comisión
  // aplica siempre sin importar el método de pago.
  if (!categoriaCobraComision || (esPagoEnDivisas(metodoPago) && precioFijoVes)) {
    // Pago en divisas sobre producto VES → cobrar costo (sin comisión)
    if (precioFijoVes) {
      const costoVes = producto.costo_ves ?? 0
      const costoUsd = tasa > 0 ? costoVes / tasa : 0
      return { precio_usd: costoUsd, comision: 0, precio_ves: costoVes, moneda: 'USD' as const }
    } else {
      return {
        precio_usd: producto.costo_usd,
        comision: 0,
        precio_ves: producto.costo_usd * tasa,
        moneda: 'USD' as const,
      }
    }
  } else {
    // Pago en bolívares → cobrar precio con comisión
    if (precioFijoVes) {
      const precioVes = producto.precio_ves ?? 0
      const comisionVes = producto.comision_ves ?? 0
      const precioUsd = tasa > 0 ? precioVes / tasa : 0
      const comisionUsd = tasa > 0 ? comisionVes / tasa : 0
      return { precio_usd: precioUsd, comision: comisionUsd, precio_ves: precioVes, moneda: 'VES' as const }
    } else {
      return {
        precio_usd: producto.precio_usd,
        comision: producto.comision_usd,
        precio_ves: producto.precio_usd * tasa,
        moneda: 'VES' as const,
      }
    }
  }
}

/**
 * Calcula la comisión proporcional en pago mixto
 * porcionVes: monto en bolívares / total en bolívares (0-1)
 */
export function calcularComisionMixta(
  comisionTotal: number,
  porcionVes: number
): number {
  return Math.round(comisionTotal * porcionVes * 100) / 100
}

/**
 * Verifica si un método requiere campo de referencia obligatorio
 */
export function requiereReferencia(metodo: MetodoPago): boolean {
  const conReferencia: MetodoPago[] = [
    'pago_movil',
    'transferencia_ves',
    'banesco_pos',
    'zelle',
    'binance',
    'billetera_digital_usd',
    'vale',
  ]
  return conReferencia.includes(metodo)
}

/**
 * Verifica si un método es biopago (requiere confirmación de dispositivo)
 */
export function esBiopago(metodo: MetodoPago): boolean {
  return metodo === 'biopago'
}
