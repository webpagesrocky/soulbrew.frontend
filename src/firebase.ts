import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  throw new Error(
    `Falta configuración de Firebase (${missing.join(", ")}). Copia .env.example como .env y llénalo.`,
  );
}

const app = initializeApp(config);

/**
 * La sesión se guarda en el dispositivo y sobrevive a recargas y a cerrar la
 * pestaña. Se declaran tres almacenes en orden de preferencia porque no todos
 * están disponibles siempre: Safari de iOS bloquea IndexedDB en navegación
 * privada, y algunos navegadores embebidos (el de Instagram, por ejemplo)
 * también. Sin esta cadena de respaldo, en esos casos la sesión se guardaría
 * sólo en memoria y se perdería en cada recarga.
 */
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});

/**
 * Caché local de Firestore: el menú, los pedidos y el inventario quedan
 * guardados en el dispositivo, así que al recargar se pintan de inmediato en
 * vez de esperar a la red, y siguen consultables si el internet se cae. Lo que
 * se escriba sin conexión se sincroniza solo al volver.
 *
 * El gestor multipestaña evita que dos pestañas abiertas se peleen por la
 * misma caché, que es el caso normal en una barra con el panel y el menú
 * público abiertos a la vez.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
