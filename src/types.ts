export type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";

/** Id del documento en `categories`. Ya no es una lista fija. */
export type ProductCategory = string;

export interface Category {
  id: ProductCategory;
  name: string;
  emoji: string;
  order: number;
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  /** data URI comprimido o URL externa; null si no tiene foto. */
  imageUrl: string | null;
  price: number;
  /** Costo de preparación. 0 en productos dados de alta antes de este campo. */
  cost: number;
  stock: number;
  active: boolean;
  /**
   * Interruptor manual, independiente del conteo de inventario: para el caso
   * de "hoy no hay leche de avena" aunque el stock real siga en positivo.
   */
  soldOut: boolean;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  code: string;
  customerPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  total: number;
  items: OrderItem[];
  cashSessionId: string | null;
  createdAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface CashTotals {
  cashTotal: number;
  cardTotal: number;
  transferTotal: number;
  salesTotal: number;
  saleCount: number;
}

export interface CashSession {
  id: string;
  userId: string;
  userName: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  differenceAmount: number | null;
  totals: CashTotals | null;
  status: "OPEN" | "CLOSED";
  openedAt: Date | null;
  closedAt: Date | null;
}

/**
 * Insumo de barra: leche, vasos, jarabes. No se vende ni aparece en el menú,
 * por eso no tiene categoría ni precio de venta. Su existencia admite
 * decimales (2.5 L), a diferencia del stock de productos.
 */
export interface Supply {
  id: string;
  name: string;
  /** Unidad de medida: L, kg, pz, cajas… */
  unit: string;
  stock: number;
  /** Costo por unidad. */
  cost: number;
  /** Umbral para avisar que está por acabarse. */
  minStock: number;
  active: boolean;
}

export interface SupplyMovement {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  userId: string;
  userName: string;
  quantityChange: number;
  reason: string;
  createdAt: Date | null;
}

/** WASTE: merma registrada al cerrar turno. ADJUSTMENT: corrección manual. */
export type MovementType = "WASTE" | "ADJUSTMENT";

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  quantityChange: number;
  reason: string;
  type: MovementType;
  createdAt: Date | null;
}
