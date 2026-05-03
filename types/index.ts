export type Rol = 'admin' | 'supervisor' | 'cajero' | 'auditor'
export type EstadoCaja = 'abierta' | 'cerrada'
export type FuenteTasa = 'bcvapi' | 'scraping' | 'manual'
export type TipoCorte = 'parcial' | 'final'
export type Moneda = 'USD' | 'VES' | 'MIXTO'

export type MetodoPago =
  | 'efectivo_usd'
  | 'efectivo_ves'
  | 'pago_movil'
  | 'transferencia_ves'
  | 'banesco_pos'
  | 'biopago'
  | 'zelle'
  | 'binance'
  | 'billetera_digital_usd'
  | 'vale'

export const METODOS_DIVISAS: MetodoPago[] = [
  'efectivo_usd',
  'zelle',
  'binance',
  'billetera_digital_usd',
  'vale',
]

export const METODOS_BOLIVARES: MetodoPago[] = [
  'efectivo_ves',
  'pago_movil',
  'transferencia_ves',
  'banesco_pos',
  'biopago',
]

export const METODOS_CON_REFERENCIA: MetodoPago[] = [
  'pago_movil',
  'transferencia_ves',
  'banesco_pos',
  'zelle',
  'binance',
  'billetera_digital_usd',
]

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  created_at: string
}

export interface Caja {
  id: string
  nombre: string
  usuario_id: string
  saldo_apertura_usd: number
  saldo_apertura_ves: number
  estado: EstadoCaja
  turno: 1 | 2 | null
  turno_inicio: string | null
  turno_fin: string | null
  created_at: string
}

export interface TasaCambio {
  id: string
  moneda: string
  tasa: number
  fuente: FuenteTasa
  fecha_vigencia: string
  created_at: string
  stale?: boolean
}

export interface Categoria {
  id: string
  nombre: string
  activa: boolean
  cobra_comision: boolean
  inventario_unidades: boolean
}

export type TipoSistema = 'saldo_ves' | 'unidades' | 'contador'

export interface SistemaInventario {
  id: string
  nombre: string
  tipo: TipoSistema
  moneda: 'VES' | 'USD'
  saldo_actual: number
  saldo_turno_1: number
  saldo_turno_2: number
  activo: boolean
  created_at: string
}

export interface MovimientoInventario {
  id: string
  sistema_id: string
  sistema?: SistemaInventario
  tipo: 'carga' | 'venta' | 'ajuste' | 'cierre'
  cantidad: number
  turno: 1 | 2 | null
  descripcion: string | null
  transaccion_id: string | null
  usuario_id: string | null
  usuario?: { nombre: string }
  created_at: string
}

export interface Producto {
  id: string
  nombre: string
  categoria_id: string
  categoria?: Categoria
  sistema_id: string | null
  sistema?: SistemaInventario
  moneda_precio: 'USD' | 'VES'
  costo_usd: number
  precio_usd: number
  comision_usd: number
  costo_ves: number | null
  precio_ves: number | null
  comision_ves: number | null
  imagen_url: string | null
  activo: boolean
  monto_variable: boolean
  created_at: string
  updated_at: string
}

export interface ItemTransaccion {
  id: string
  transaccion_id: string
  producto_id: string
  nombre_producto: string
  costo_usd: number
  precio_usd: number
  comision_cobrada: number
  comision_definida: number
  monto_libre_usd: number | null
}

export interface PagoTransaccion {
  id: string
  transaccion_id: string
  metodo: MetodoPago
  moneda: string
  monto: number
  referencia: string | null
}

export interface Transaccion {
  id: string
  caja_id: string
  usuario_id: string
  metodo_pago: MetodoPago[]
  moneda_cobro: Moneda
  tasa_aplicada: number
  subtotal_usd: number
  comision_total_usd: number
  total_usd: number
  total_ves: number
  referencia: string | null
  observaciones: string | null
  anulada: boolean
  created_at: string
  items?: ItemTransaccion[]
  pagos?: PagoTransaccion[]
}

export interface CortesCaja {
  id: string
  caja_id: string
  usuario_id: string
  tipo: TipoCorte
  total_sistema_usd: number
  total_sistema_ves: number
  efectivo_contado_usd: number
  efectivo_contado_ves: number
  diferencia_usd: number
  diferencia_ves: number
  comision_total_usd: number
  premios_usd: number
  premios_ves: number
  fondo_devuelto_usd: number
  fondo_devuelto_ves: number
  observaciones: string | null
  aprobado_por: string | null
  created_at: string
}

export interface PremioLoteria {
  id: string
  semana_id: string | null
  caja_id: string
  producto_id: string | null
  producto?: { nombre: string }
  tipo: 'reintegro' | 'mayor'
  moneda: 'USD' | 'VES'
  monto: number
  numero_ticket: string | null
  observaciones: string | null
  fuente: 'caja' | 'externo'
  metodo_externo: 'efectivo' | 'pago_movil' | null
  caja?: { turno: 1 | 2 | null; usuario_id: string }
  created_at: string
}

export interface PremioBoleteria {
  id: string
  semana_id: string | null
  caja_id: string
  producto_id: string | null
  producto?: { nombre: string }
  tipo: 'reintegro' | 'mayor'
  moneda: 'USD' | 'VES'
  monto: number
  observaciones: string | null
  fuente: 'caja' | 'externo'
  metodo_externo: 'efectivo' | 'pago_movil' | null
  caja?: { turno: 1 | 2 | null }
  created_at: string
}

// Tipos para el carrito del POS
export interface ItemCarrito {
  producto: Producto
  cantidad: number
  monto_libre_usd?: number   // cuando el operador ingresó en USD
  monto_libre_ves?: number   // cuando el operador ingresó en VES
}

export interface ResumenPago {
  subtotal_usd: number
  comision_total_usd: number
  total_usd: number
  total_ves: number
}

export interface SemanaBoleteria {
  id: string
  fecha_inicio: string
  fecha_fin: string
  estado: 'abierta' | 'cerrada'
  notas: string | null
  created_at: string
  // Resumen guardado al cerrar la semana
  cierre_recibidos_usd: number | null
  cierre_vendidos_usd:  number | null
  cierre_ingreso_usd:   number | null
  cierre_comision_usd:  number | null
  cierre_deuda_usd:     number | null
  cierre_premios_usd:   number | null
  cierre_recibidos_ves: number | null
  cierre_vendidos_ves:  number | null
  cierre_ingreso_ves:   number | null
  cierre_comision_ves:  number | null
  cierre_deuda_ves:     number | null
  cierre_premios_ves:   number | null
}

export interface RecepcionBoleteria {
  id: string
  semana_id: string
  producto_id: string
  cantidad: number
}

export interface FilaArqueoLoteria {
  producto_id: string
  nombre: string
  moneda: 'USD' | 'VES'
  precio: number
  costo: number
  comision: number
  comision_pct: number
  recibidos: number
  vendidos: number
  vendidos_calculado?: number
  vendidos_manual?: number | null
  disponibles: number
  ingreso_bruto: number
  comision_total: number
  deuda_proveedor: number
}
