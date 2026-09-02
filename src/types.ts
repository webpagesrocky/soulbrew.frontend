export type Role = "ADMIN" | "SUPERVISOR" | "EMPLOYEE";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";

/** Id del documento en `categories`. Ya no es una lista fija. */
export type ProductCategory = string;

/**
 * Un ingrediente de la receta de una categoría: cuánto de un insumo consume
 * cada unidad vendida. `supplyName` y `unit` van copiados para poder mostrar
 * la receta sin tener que cruzar con la lista de insumos.
 */
export interface RecipeItem {
  supplyId: string;
  supplyName: string;
  unit: string;
  /** Cantidad por unidad vendida (250 ml de leche por bebida, 1 vaso...). */
  quantity: number;
}

export interface Category {
  id: ProductCategory;
  name: string;
  emoji: string;
  order: number;
  active: boolean;
  /**
   * Insumos que consume cada unidad vendida de esta categoría. Vacío en las
   * categorías creadas antes de las recetas: entonces vender no descuenta nada.
   */
  recipe: RecipeItem[];
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
  /**
   * Costo capturado a mano. Sólo se usa mientras el producto no tenga receta
   * (propia ni de su categoría): en cuanto la tiene, el costo real se calcula
   * de los insumos. Ver `productCost` en api/costing.ts.
   */
  cost: number;
  /**
   * Receta propia, para el producto que lleva algo distinto al resto de su
   * categoría (el Banana matcha y su plátano). Vacía = usa la de la categoría.
   */
  recipe: RecipeItem[];
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
  customerName: string;
  /** Vacío si el cliente no lo dio: el teléfono es opcional, sólo alimenta la tarjeta de puntos. */
  customerPhone: string;
  /** true si este pedido fue el que llegó a la décima visita de ese teléfono. */
  rewardEligible: boolean;
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

/** Tarjeta de puntos: doc id = teléfono. Cada 10 visitas se gana un café gratis. */
export interface Customer {
  phone: string;
  name: string;
  visits: number;
  totalFreeEarned: number;
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
  /** Unidad en la que se *usa* y se lleva la existencia: ml, g, pz… */
  unit: string;
  stock: number;
  /**
   * Costo de UNA unidad de uso (un ml, un gramo). No se captura a mano: sale
   * de dividir `packCost` entre `packSize`, para no obligar a nadie a sacar
   * esa división cada vez que cambia el precio del paquete.
   */
  cost: number;
  /** Umbral para avisar que está por acabarse, en unidades de uso. */
  minStock: number;
  active: boolean;
  /**
   * Presentación en que se compra: "paquete de 600 ml a $28".
   * `packSize` en unidades de uso; 0 en los insumos dados de alta antes de
   * existir esto, que siguen usando su `cost` capturado a mano.
   */
  packSize: number;
  packCost: number;
  /** Cómo se le llama a la presentación: paquete, caja, bolsa, galón… */
  packLabel: string;
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
