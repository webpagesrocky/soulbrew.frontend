import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "../firebase";
import type { Role, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El rol viaja en los custom claims del ID token, no en Firestore: así las
 * reglas de seguridad lo leen sin una lectura extra y el cliente no puede
 * falsearlo.
 *
 * `forceRefresh` en false lee el token ya guardado en el dispositivo, sin
 * tocar la red. Con true pide uno nuevo al servidor, que es la única forma de
 * enterarse de un cambio de rol o de una baja de cuenta.
 */
async function toUser(
  firebaseUser: FirebaseUser,
  forceRefresh: boolean,
): Promise<User | null> {
  const token = await firebaseUser.getIdTokenResult(forceRefresh);
  const role = token.claims.role as Role | undefined;

  if (!role || token.claims.active !== true) return null;

  return {
    id: firebaseUser.uid,
    name: firebaseUser.displayName ?? firebaseUser.email ?? "",
    email: firebaseUser.email ?? "",
    role,
    active: true,
    createdAt: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    /**
     * Comprueba contra el servidor si el rol sigue vigente, sin bloquear la
     * carga. Sólo cierra sesión cuando el servidor confirma que la cuenta ya
     * no tiene acceso; si no hay red, se deja la sesión como está.
     */
    async function revalidate(firebaseUser: FirebaseUser) {
      try {
        const refreshed = await toUser(firebaseUser, true);
        if (cancelled) return;
        if (refreshed) setUser(refreshed);
        else {
          await signOut(auth);
          setUser(null);
        }
      } catch {
        // Sin conexión: la sesión guardada sigue siendo válida hasta que se
        // pueda confirmar lo contrario.
      }
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        // Primero el token guardado: es instantáneo y funciona sin internet,
        // así que una recarga con la red caída ya no saca a nadie del panel.
        const cached = await toUser(firebaseUser, false);
        if (cancelled) return;

        if (cached) {
          setUser(cached);
          setLoading(false);
          void revalidate(firebaseUser);
          return;
        }

        // Sin rol en el token guardado. Puede ser una cuenta recién creada a
        // la que le acaban de asignar el rol, así que se pide uno fresco antes
        // de darla por inválida.
        const refreshed = await toUser(firebaseUser, true);
        if (cancelled) return;

        if (refreshed) {
          setUser(refreshed);
        } else {
          await signOut(auth);
          setUser(null);
        }
      } catch {
        // Un fallo de red no debe cerrar la sesión: se marca como no
        // autenticado en esta carga, pero el token guardado sigue intacto y
        // la siguiente recarga con conexión vuelve a entrar sola.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
  }, []);

  async function login(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const resolved = await toUser(credential.user, true);

    // Cuenta válida en Firebase Auth pero sin rol asignado o dada de baja.
    if (!resolved) {
      await signOut(auth);
      throw new Error("Tu cuenta no tiene acceso al panel. Contacta a un administrador.");
    }

    // Se asigna aquí y no sólo desde onAuthStateChanged para que la
    // redirección posterior al login no encuentre la sesión todavía vacía.
    setUser(resolved);
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
