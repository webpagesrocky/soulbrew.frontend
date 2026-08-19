import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  CashSession,
  Category,
  InventoryMovement,
  Order,
  OrderStatus,
  Product,
  ProductCategory,
  User,
} from "../types";

/**
 * Lecturas en vivo de Firestore.
 *
 * Sustituyen a los GET de la API Express. Al ser suscripciones, los paneles se
 * actualizan solos cuando otra caja cobra o cuando entra una orden del menú
 * público, sin recargar ni volver a pedir datos.
 */

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

type Snapshot = QueryDocumentSnapshot<DocumentData>;

function toProduct(snapshot: Snapshot): Product {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    description: data.description ?? null,
    category: data.category as ProductCategory,
    imageUrl: data.imageUrl ?? null,
    price: data.price,
    cost: data.cost ?? 0,
    stock: data.stock,
    active: Boolean(data.active),
  };
}

function toCategory(snapshot: Snapshot): Category {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    emoji: data.emoji ?? "",
    order: data.order ?? 0,
    active: Boolean(data.active),
  };
}

function toOrder(snapshot: Snapshot): Order {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    code: data.code,
    customerName: data.customerName,
    status: data.status as OrderStatus,
    paymentMethod: data.paymentMethod ?? null,
    total: data.total,
    items: data.items ?? [],
    cashSessionId: data.cashSessionId ?? null,
    createdAt: toDate(data.createdAt),
    paidAt: toDate(data.paidAt),
    cancelledAt: toDate(data.cancelledAt),
    cancellationReason: data.cancellationReason ?? null,
  };
}

function toCashSession(snapshot: Snapshot): CashSession {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    userId: data.userId,
    userName: data.userName ?? "",
    openingAmount: data.openingAmount,
    closingAmount: data.closingAmount ?? null,
    expectedAmount: data.expectedAmount ?? null,
    differenceAmount: data.differenceAmount ?? null,
    totals: data.totals ?? null,
    status: data.status,
    openedAt: toDate(data.openedAt),
    closedAt: toDate(data.closedAt),
  };
}

function toUser(snapshot: Snapshot): User {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    email: data.email,
    role: data.role,
    active: Boolean(data.active),
    createdAt: toDate(data.createdAt),
  };
}

function toMovement(snapshot: Snapshot): InventoryMovement {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    productId: data.productId,
    productName: data.productName,
    userId: data.userId,
    userName: data.userName,
    quantityChange: data.quantityChange,
    reason: data.reason,
    // Los movimientos anteriores a que existiera `type` eran todos manuales.
    type: data.type ?? "ADJUSTMENT",
    createdAt: toDate(data.createdAt),
  };
}

function subscribe<T>(
  path: string,
  constraints: QueryConstraint[],
  map: (snapshot: Snapshot) => T,
  onData: (rows: T[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(db, path), ...constraints),
    (snapshot) => onData(snapshot.docs.map(map)),
    onError,
  );
}

/**
 * Menú público. El `where("active", "==", true)` no es sólo un filtro: las
 * reglas rechazan la consulta completa si falta, porque una lectura anónima
 * sólo está permitida sobre productos activos.
 */
export function subscribePublicProducts(
  onData: (products: Product[]) => void,
  onError: (error: Error) => void,
) {
  return subscribe(
    "products",
    [where("active", "==", true), orderBy("name")],
    toProduct,
    onData,
    onError,
  );
}

export function subscribeProducts(
  onData: (products: Product[]) => void,
  onError: (error: Error) => void,
) {
  return subscribe("products", [orderBy("name")], toProduct, onData, onError);
}

export function subscribeOrders(
  status: OrderStatus | "",
  onData: (orders: Order[]) => void,
  onError: (error: Error) => void,
) {
  const constraints: QueryConstraint[] = status ? [where("status", "==", status)] : [];
  return subscribe(
    "orders",
    [...constraints, orderBy("createdAt", "desc"), limit(200)],
    toOrder,
    onData,
    onError,
  );
}

/** Inicio del día local (00:00) del día indicado. */
export function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Pedidos dentro de un rango. Lo usan tanto el panel del día como el historial
 * y el reporte semanal, que sólo cambian los extremos del rango.
 */
export function subscribeOrdersBetween(
  from: Date,
  to: Date | null,
  onData: (orders: Order[]) => void,
  onError: (error: Error) => void,
) {
  const constraints: QueryConstraint[] = [where("createdAt", ">=", Timestamp.fromDate(from))];
  if (to) constraints.push(where("createdAt", "<", Timestamp.fromDate(to)));
  return subscribe(
    "orders",
    [...constraints, orderBy("createdAt", "desc"), limit(500)],
    toOrder,
    onData,
    onError,
  );
}

/**
 * Historial de cortes. `userId` no es opcional por comodidad: un empleado sólo
 * puede leer sus propios cortes, y las reglas rechazan la consulta entera si no
 * viene acotada. Supervisores y admin la piden sin filtro y ven todo.
 */
export function subscribeCashSessions(
  userId: string | undefined,
  onData: (sessions: CashSession[]) => void,
  onError: (error: Error) => void,
) {
  const constraints: QueryConstraint[] = userId ? [where("userId", "==", userId)] : [];
  return subscribe(
    "cashSessions",
    [...constraints, orderBy("openedAt", "desc"), limit(100)],
    toCashSession,
    onData,
    onError,
  );
}

export function subscribeUsers(onData: (users: User[]) => void, onError: (error: Error) => void) {
  return subscribe("users", [orderBy("createdAt", "desc")], toUser, onData, onError);
}

export function subscribeInventoryMovements(
  onData: (movements: InventoryMovement[]) => void,
  onError: (error: Error) => void,
  from?: Date,
) {
  const constraints: QueryConstraint[] = from
    ? [where("createdAt", ">=", Timestamp.fromDate(from))]
    : [];
  return subscribe(
    "inventoryMovements",
    [...constraints, orderBy("createdAt", "desc"), limit(250)],
    toMovement,
    onData,
    onError,
  );
}

/** Borra un pedido. Sale del historial y del reporte; no descuadra cortes ya cerrados. */
export async function deleteOrder(id: string) {
  await deleteDoc(doc(db, "orders", id));
}

/** Borra un corte de caja. Las reglas sólo lo permiten si ya está cerrado. */
export async function deleteCashSession(id: string) {
  await deleteDoc(doc(db, "cashSessions", id));
}

/** Categorías del menú. Lectura pública: el menú las necesita sin sesión. */
export function subscribeCategories(
  onData: (categories: Category[]) => void,
  onError: (error: Error) => void,
) {
  return subscribe("categories", [orderBy("order")], toCategory, onData, onError);
}

export interface CategoryInput {
  name: string;
  emoji: string;
  order: number;
  active: boolean;
}

/**
 * El id se deriva del nombre porque es lo que queda guardado en cada producto:
 * un id legible hace que los datos se puedan leer sin cruzar colecciones.
 */
export function categoryId(name: string): string {
  const withoutAccents = [...name.normalize("NFD")]
    .filter((char) => {
      const code = char.charCodeAt(0);
      // Descarta los diacríticos combinantes que deja NFD (café -> cafe).
      return code < 0x300 || code > 0x36f;
    })
    .join("");
  return withoutAccents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function createCategory(id: string, input: CategoryInput) {
  await setDoc(doc(db, "categories", id), input);
}

export async function updateCategory(id: string, input: CategoryInput) {
  await setDoc(doc(db, "categories", id), input);
}

export async function deleteCategory(id: string) {
  await deleteDoc(doc(db, "categories", id));
}

export interface ProductInput {
  name: string;
  description: string | null;
  category: ProductCategory;
  imageUrl: string | null;
  price: number;
  cost: number;
}

/**
 * Alta y edición de productos van directo a Firestore, sin Cloud Function: las
 * reglas validan la forma y garantizan que el stock no se pueda tocar desde
 * aquí. El inventario sólo se mueve por venta, cancelación o ajuste.
 */
export async function createProduct(input: ProductInput) {
  await addDoc(collection(db, "products"), {
    ...input,
    stock: 0,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProduct(id: string, input: ProductInput & { active: boolean }) {
  await updateDoc(doc(db, "products", id), { ...input, updatedAt: serverTimestamp() });
}

/**
 * Borrado definitivo. Las órdenes pasadas conservan su renglón (guardan nombre
 * y precio propios), pero una venta ya pagada de este producto ya no se podrá
 * cancelar: devolver el stock necesita leer el documento que aquí se elimina.
 * Para retirar algo del menú de forma reversible, usa `active: false`.
 */
export async function deleteProduct(id: string) {
  await deleteDoc(doc(db, "products", id));
}
