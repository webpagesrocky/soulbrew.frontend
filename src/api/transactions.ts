import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "../firebase";
import type { OrderItem, PaymentMethod } from "../types";

/**
 * Escrituras que mueven dinero o inventario.
 *
 * Sin Cloud Functions (plan Spark), esto corre en el navegador de quien
 * cobra o abre caja — pero las reglas de Firestore (firestore.rules) validan
 * cada documento del lado del servidor de Google, documento por documento,
 * sin importar qué código lo haya escrito. Lo único que un cliente anónimo ya
 * no puede hacer es tocar `stock`: por eso una orden pública sólo reserva
 * inventario hasta que personal autenticado la cobra (ver `payOrder`).
 *
 * Cada función de aquí hace exactamente las mismas lecturas/escrituras que
 * antes hacía la Cloud Function equivalente, para que las reglas (que exigen
 * una relación matemática exacta entre lo leído y lo escrito) las acepten.
 */

const MAX_ITEMS = 8;

export class OrderError extends Error {}

interface Actor {
  uid: string;
  name: string;
}

function productRef(productId: string): DocumentReference {
  return doc(db, "products", productId);
}

export interface CreateOrderInput {
  customerPhone: string;
  items: Array<{ productId: string; quantity: number }>;
}

const PHONE_PATTERN = /^\d{10}$/;

export async function createPublicOrder(input: CreateOrderInput) {
  if (!PHONE_PATTERN.test(input.customerPhone)) {
    throw new OrderError("El número de celular debe tener 10 dígitos.");
  }
  const aggregated = new Map<string, number>();
  for (const item of input.items) {
    aggregated.set(item.productId, (aggregated.get(item.productId) ?? 0) + item.quantity);
  }
  const productIds = [...aggregated.keys()];
  if (!productIds.length) throw new OrderError("Elige al menos un producto.");
  if (productIds.length > MAX_ITEMS) {
    throw new OrderError(`Una orden admite hasta ${MAX_ITEMS} productos distintos.`);
  }

  const counterRef = doc(db, "counters", "orders");
  const orderRef = doc(collection(db, "orders"));

  return runTransaction(db, async (tx) => {
    const productSnaps = await Promise.all(productIds.map((id) => tx.get(productRef(id))));
    const counterSnap = await tx.get(counterRef);

    let total = 0;
    const items: OrderItem[] = [];
    for (const snapshot of productSnaps) {
      if (!snapshot.exists()) throw new OrderError("Uno o más productos no existen");
      const product = snapshot.data() as { name: string; price: number; active: boolean };
      if (!product.active) throw new OrderError(`${product.name} no está disponible`);

      const quantity = aggregated.get(snapshot.id)!;
      // Multiplicación sin redondear: las reglas de Firestore hacen la misma
      // cuenta con los mismos operandos, y deben dar exactamente el mismo
      // resultado en punto flotante para que la validación coincida.
      const subtotal = product.price * quantity;
      total += subtotal;
      items.push({ productId: snapshot.id, productName: product.name, quantity, unitPrice: product.price, subtotal });
    }

    const sequence = ((counterSnap.data()?.value as number | undefined) ?? 0) + 1;
    const code = `SB-${String(sequence).padStart(6, "0")}`;

    tx.set(counterRef, { value: sequence });
    tx.set(orderRef, {
      code,
      sequence,
      customerPhone: input.customerPhone,
      status: "PENDING",
      paymentMethod: null,
      total,
      items,
      cashSessionId: null,
      cancelledBy: null,
      cancellationReason: null,
      createdAt: serverTimestamp(),
      paidAt: null,
      cancelledAt: null,
    });

    return { id: orderRef.id, code, customerPhone: input.customerPhone, status: "PENDING" as const, total };
  });
}

async function findOpenSessionId(uid: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, "cashSessions"), where("userId", "==", uid), where("status", "==", "OPEN"), limit(1)),
  );
  return snap.empty ? null : snap.docs[0]!.id;
}

export async function payOrder(orderId: string, paymentMethod: PaymentMethod, actor: Actor) {
  const sessionId = await findOpenSessionId(actor.uid);
  if (!sessionId) throw new OrderError("Debes abrir una caja antes de cobrar");

  const orderRef = doc(db, "orders", orderId);

  return runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new OrderError("Orden no encontrada");
    const order = orderSnap.data() as { status: string; total: number; items: OrderItem[] };
    if (order.status !== "PENDING") throw new OrderError("Solo se pueden cobrar órdenes pendientes");
    if (order.items.length > MAX_ITEMS) throw new OrderError("Orden con demasiados productos para procesar");

    const productSnaps = await Promise.all(order.items.map((item) => tx.get(productRef(item.productId))));

    tx.update(orderRef, { status: "PAID", paymentMethod, cashSessionId: sessionId, paidAt: serverTimestamp() });
    order.items.forEach((item, index) => {
      const stock = productSnaps[index]!.data()!.stock as number;
      tx.update(productRef(item.productId), { stock: stock - item.quantity });
    });

    return { id: orderId, status: "PAID" as const, paymentMethod, cashSessionId: sessionId, total: order.total };
  });
}

export async function cancelOrder(orderId: string, reason: string, actor: Actor) {
  const orderRef = doc(db, "orders", orderId);

  return runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new OrderError("Orden no encontrada");
    const order = orderSnap.data() as {
      status: string;
      items: OrderItem[];
      cashSessionId: string | null;
    };
    if (order.status === "CANCELLED") throw new OrderError("La orden ya está cancelada");
    if (order.items.length > MAX_ITEMS) throw new OrderError("Orden con demasiados productos para procesar");

    const wasPaid = order.status === "PAID";
    if (wasPaid && order.cashSessionId) {
      const sessionSnap = await tx.get(doc(db, "cashSessions", order.cashSessionId));
      if (sessionSnap.data()?.status === "CLOSED") {
        throw new OrderError("No se puede cancelar una venta incluida en un corte cerrado");
      }
    }
    const productSnaps = wasPaid
      ? await Promise.all(order.items.map((item) => tx.get(productRef(item.productId))))
      : [];

    tx.update(orderRef, {
      status: "CANCELLED",
      cancelledBy: actor.uid,
      cancellationReason: reason,
      cancelledAt: serverTimestamp(),
    });
    if (wasPaid) {
      order.items.forEach((item, index) => {
        const stock = productSnaps[index]!.data()!.stock as number;
        tx.update(productRef(item.productId), { stock: stock + item.quantity });
      });
    }

    return { id: orderId, status: "CANCELLED" as const, reason };
  });
}

export async function openCashSession(openingAmount: number, actor: Actor) {
  const sessionRef = doc(collection(db, "cashSessions"));
  const markerRef = doc(db, "openCashSessions", actor.uid);

  return runTransaction(db, async (tx) => {
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists()) throw new OrderError("Ya tienes una caja abierta");

    tx.set(sessionRef, {
      userId: actor.uid,
      userName: actor.name,
      openingAmount,
      closingAmount: null,
      expectedAmount: null,
      differenceAmount: null,
      totals: null,
      status: "OPEN",
      openedAt: serverTimestamp(),
      closedAt: null,
    });
    tx.set(markerRef, { sessionId: sessionRef.id });

    return { id: sessionRef.id, openingAmount, status: "OPEN" as const };
  });
}

export async function closeCashSession(sessionId: string, closingAmount: number) {
  // Los totales se calculan con una consulta fuera de la transacción: el SDK
  // web no permite consultas (sólo lecturas por referencia) dentro de
  // runTransaction. Una venta cobrada en el instante exacto del cierre podría
  // quedar fuera del corte — riesgo aceptado, de ventana muy pequeña.
  const paidOrdersSnap = await getDocs(
    query(collection(db, "orders"), where("cashSessionId", "==", sessionId), where("status", "==", "PAID")),
  );

  const totals = { cashTotal: 0, cardTotal: 0, transferTotal: 0, salesTotal: 0, saleCount: paidOrdersSnap.size };
  for (const docSnap of paidOrdersSnap.docs) {
    const order = docSnap.data() as { total: number; paymentMethod: string | null };
    totals.salesTotal += order.total;
    if (order.paymentMethod === "CASH") totals.cashTotal += order.total;
    else if (order.paymentMethod === "CARD") totals.cardTotal += order.total;
    else if (order.paymentMethod === "TRANSFER") totals.transferTotal += order.total;
  }

  const sessionRef = doc(db, "cashSessions", sessionId);

  return runTransaction(db, async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists()) throw new OrderError("Corte de caja no encontrado");
    const session = sessionSnap.data() as { status: string; userId: string; openingAmount: number };
    if (session.status !== "OPEN") throw new OrderError("Esta caja ya fue cerrada");

    const expectedAmount = session.openingAmount + totals.cashTotal;
    const differenceAmount = closingAmount - expectedAmount;

    tx.update(sessionRef, {
      status: "CLOSED",
      closingAmount,
      expectedAmount,
      differenceAmount,
      totals,
      closedAt: serverTimestamp(),
    });
    tx.delete(doc(db, "openCashSessions", session.userId));

    return {
      id: sessionId,
      status: "CLOSED" as const,
      openingAmount: session.openingAmount,
      closingAmount,
      expectedAmount,
      differenceAmount,
      totals,
    };
  });
}

async function moveStock(
  productId: string,
  quantityChange: number,
  reason: string,
  type: "WASTE" | "ADJUSTMENT",
  actor: Actor,
) {
  const ref = productRef(productId);
  const movementRef = doc(collection(db, "inventoryMovements"));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new OrderError("Producto no encontrado");
    const product = snap.data() as { name: string; stock: number };
    const stock = product.stock + quantityChange;
    if (stock < 0) {
      throw new OrderError(
        type === "WASTE"
          ? `No hay tanto ${product.name} en existencia para registrar esa merma`
          : "El ajuste dejaría existencias negativas",
      );
    }

    tx.update(ref, { stock });
    tx.set(movementRef, {
      productId,
      productName: product.name,
      userId: actor.uid,
      userName: actor.name,
      quantityChange,
      reason,
      type,
      createdAt: serverTimestamp(),
    });

    return { productId, previousStock: product.stock, change: quantityChange, stock, reason };
  });
}

/**
 * Entrada o salida de un insumo (leche, vasos…).
 *
 * Ajusta la existencia y deja el movimiento en la misma transacción, para que
 * nunca quede un cambio de stock sin explicación en la bitácora.
 */
export async function moveSupply(
  supplyId: string,
  quantityChange: number,
  reason: string,
  actor: Actor,
) {
  if (quantityChange === 0) throw new OrderError("La cantidad no puede ser cero");

  const ref = doc(db, "supplies", supplyId);
  const movementRef = doc(collection(db, "supplyMovements"));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new OrderError("Insumo no encontrado");
    const supply = snap.data() as { name: string; unit: string; stock: number };

    // Se redondea a 2 decimales: sumar 0.1 repetidas veces en punto flotante
    // deja residuos como 2.7999999999999994 en la existencia.
    const stock = Math.round((supply.stock + quantityChange) * 100) / 100;
    if (stock < 0) {
      throw new OrderError(`No hay suficiente ${supply.name} en existencia`);
    }

    tx.update(ref, { stock });
    tx.set(movementRef, {
      supplyId,
      supplyName: supply.name,
      unit: supply.unit,
      userId: actor.uid,
      userName: actor.name,
      quantityChange,
      reason,
      createdAt: serverTimestamp(),
    });

    return { supplyId, previousStock: supply.stock, stock, reason };
  });
}

/** Corrección manual de existencias. Sólo administración. */
export async function adjustInventory(
  productId: string,
  quantityChange: number,
  reason: string,
  actor: Actor,
) {
  return moveStock(productId, quantityChange, reason, "ADJUSTMENT", actor);
}

/**
 * Merma del turno: lo que se tiró, se derramó o se dio de muestra.
 *
 * Se registra al cerrar caja y descuenta inventario. No duplica el descuento
 * de las ventas: aquéllas ya se restaron al cobrarse, esto es lo que se perdió
 * sin venderse.
 */
export async function registerWaste(
  productId: string,
  quantity: number,
  reason: string,
  actor: Actor,
) {
  if (quantity <= 0) throw new OrderError("La merma debe ser mayor a cero");
  return moveStock(productId, -Math.abs(quantity), reason, "WASTE", actor);
}
