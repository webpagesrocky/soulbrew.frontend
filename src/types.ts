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
  /**
   * Personalización propia, que gana sobre la de su categoría. Vacío = usa la
   * que corresponda a su categoría, igual que con la receta.
   */
  optionGroups: ProductOptionGroup[];
  stock: number;
  active: boolean;
  /**
   * Interruptor manual, independiente del conteo de inventario: para el caso
   * de "hoy no hay leche de avena" aunque el stock real siga en positivo.
   */
  soldOut: boolean;
}

/**
 * Una opción dentro de un grupo de personalización: "Almendra", "Lotus".
 * `imageUrl` es opcional — si la trae, la foto del producto cambia a ésa
 * cuando el cliente la elige.
 */
export interface OptionChoice {
  id: string;
  name: string;
  /** Lo que suma al precio del producto. 0 si no cobra nada. */
  priceDelta: number;
  /**
   * Foto por omisión de la opción, para cuando sirve igual en cualquier
   * categoría. Las que cambian según la bebida viven en `optionImages`.
   */
  imageUrl: string | null;
  active: boolean;
}

/**
 * Foto de una opción para una categoría concreta: el lotus se ve distinto
 * sobre un matcha que sobre un latte.
 *
 * Vive en su propia colección y no dentro del grupo porque cada foto pesa
 * decenas de KB y un documento de Firestore tope en 1 MiB: seis cold foams por
 * tres categorías dentro del mismo documento lo reventarían.
 */
export interface OptionImage {
  id: string;
  groupId: string;
  optionId: string;
  categoryId: ProductCategory;
  imageUrl: string;
}

/**
 * Grupo de personalización, armado desde el panel: "Tipo de leche", "Cold
 * Foam", "Temperatura". Cada producto elige cuáles le aplican, así que sumar
 * un cold foam nuevo no toca el código.
 */
export interface OptionGroup {
  id: string;
  name: string;
  /** SINGLE: se elige una. MULTI: se pueden elegir varias (extras). */
  selection: "SINGLE" | "MULTI";
  /** Si es obligatorio, el cliente no puede agregar al carrito sin elegir. */
  required: boolean;
  order: number;
  active: boolean;
  /**
   * Categorías a las que aplica. Vacío = a todas. Es la forma rápida de
   * activarlo: con 30 productos, decir "el cold foam va en Matcha, Café y
   * Chai" evita marcarlo treinta veces.
   */
  categoryIds: ProductCategory[];
  /**
   * Si el grupo cambia la foto de la bebida. Los cold foams sí — se ven; el
   * tipo de leche o el endulzante no, y llenar el panel de casillas de foto
   * que nunca se van a usar sólo estorba.
   */
  hasImages: boolean;
  options: OptionChoice[];
}

/** Qué grupo le aplica a un producto y con qué opciones de ese grupo. */
export interface ProductOptionGroup {
  groupId: string;
  /** Vacío = todas las opciones activas del grupo. */
  optionIds: string[];
}

/**
 * Lo que el cliente eligió, copiado dentro del renglón de la orden. Va
 * denormalizado para que el ticket siga legible aunque después se borre el
 * grupo o cambie el precio de la opción.
 */
export interface ChosenOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  /** Precio del producto más los recargos de lo elegido. */
  unitPrice: number;
  subtotal: number;
  options: ChosenOption[];
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

/** PURCHASE: llegó mercancía. WASTE: se tiró o derramó. ADJUSTMENT: corrección de conteo. */
export type SupplyMovementType = "PURCHASE" | "WASTE" | "ADJUSTMENT";

export interface SupplyMovement {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: string;
  userId: string;
  userName: string;
  quantityChange: number;
  reason: string;
  /** ADJUSTMENT en los movimientos anteriores a que existiera este campo. */
  type: SupplyMovementType;
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
