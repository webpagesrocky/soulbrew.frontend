import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import type { CashTotals, PaymentMethod, Role } from "../types";

/**
 * Escrituras que mueven dinero o inventario.
 *
 * Sustituyen a los POST de la API Express. Viven en Cloud Functions y no en el
 * cliente porque son transaccionales y porque el navegador no es de fiar para
 * decidir precios, existencias o permisos.
 */

function callable<Input, Output>(name: string) {
  const fn = httpsCallable<Input, Output>(functions, name);
  return async (input: Input): Promise<Output> => {
    const result = await fn(input);
    return result.data;
  };
}

export const createPublicOrder = callable<
  { customerName: string; items: Array<{ productId: string; quantity: number }> },
  { id: string; code: string; customerName: string; status: "PENDING"; total: number }
>("createPublicOrder");

export const payOrder = callable<
  { orderId: string; paymentMethod: PaymentMethod },
  { id: string; status: "PAID"; paymentMethod: PaymentMethod; cashSessionId: string; total: number }
>("payOrder");

export const cancelOrder = callable<
  { orderId: string; reason: string },
  { id: string; status: "CANCELLED"; reason: string }
>("cancelOrder");

export const openCashSession = callable<
  { openingAmount: number },
  { id: string; openingAmount: number; status: "OPEN" }
>("openCashSession");

export const closeCashSession = callable<
  { sessionId: string; closingAmount: number },
  {
    id: string;
    status: "CLOSED";
    openingAmount: number;
    closingAmount: number;
    expectedAmount: number;
    differenceAmount: number;
    totals: CashTotals;
  }
>("closeCashSession");

export const adjustInventory = callable<
  { productId: string; quantityChange: number; reason: string },
  { productId: string; previousStock: number; change: number; stock: number; reason: string }
>("adjustInventory");

export const createStaffUser = callable<
  { name: string; email: string; password: string; role: Role },
  { id: string; name: string; email: string; role: Role }
>("createStaffUser");

/**
 * Las funciones callable y las reglas de Firestore devuelven códigos de error
 * de Firebase; aquí se traducen a algo que tenga sentido para quien está en la
 * barra. Los mensajes de negocio ya vienen en español desde las funciones.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Correo o contraseña incorrectos";
      case "auth/too-many-requests":
        return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
      case "auth/network-request-failed":
      case "functions/unavailable":
        return "Sin conexión con el servidor. Revisa tu red.";
      case "permission-denied":
      case "functions/permission-denied":
        return "No tienes permisos para esta acción";
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}
