import { FirebaseError } from "firebase/app";
import { OrderError } from "./transactions";

/**
 * Traduce errores de Firebase (Auth, Firestore) y de OrderError —los mensajes
 * de negocio que ya vienen en español desde transactions.ts— a algo legible
 * para quien está en la barra.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof OrderError) return error.message;

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Correo o contraseña incorrectos";
      case "auth/too-many-requests":
        return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
      case "auth/network-request-failed":
      case "unavailable":
        return "Sin conexión con el servidor. Revisa tu red.";
      case "permission-denied":
        return "No tienes permisos para esta acción";
      case "aborted":
        return "Alguien más modificó esto al mismo tiempo. Inténtalo de nuevo.";
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}
