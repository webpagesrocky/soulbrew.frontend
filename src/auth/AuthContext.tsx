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
 * reglas de seguridad y las Cloud Functions lo leen sin una lectura extra, y
 * el cliente no puede falsearlo.
 *
 * `forceRefresh` obliga a renovar el token para que un cambio de rol o una
 * baja de la cuenta surtan efecto en la siguiente carga y no hasta que expire.
 */
async function toUser(firebaseUser: FirebaseUser): Promise<User | null> {
  const token = await firebaseUser.getIdTokenResult(true);
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

  useEffect(
    () =>
      onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }
        try {
          const resolved = await toUser(firebaseUser);
          if (!resolved) await signOut(auth);
          setUser(resolved);
        } catch {
          setUser(null);
        } finally {
          setLoading(false);
        }
      }),
    [],
  );

  async function login(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const resolved = await toUser(credential.user);

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
