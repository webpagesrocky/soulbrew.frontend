# Soul Brew · Frontend

Aplicación React + Vite + TypeScript del punto de venta Soul Brew. Habla
directamente con Firebase: no hay API REST intermedia.

## Vistas

- `/`: menú público por categorías (Matcha, Café, Chai, Refresher, Tónicos),
  carrito y creación de órdenes para pagar en caja. Diseñado primero para
  móvil: barra de carrito fija, hoja inferior deslizable y respeto por el área
  segura de iOS.
- `/login`: acceso del personal con Firebase Auth.
- `/interna`: panel protegido de pedidos, caja y, según el rol, catálogo,
  inventario y equipo.

## Cómo habla con Firebase

Las **lecturas** son suscripciones en vivo a Firestore (`src/api/collections.ts`).
Los paneles se actualizan solos: si entra una orden del menú público o se agota
un producto, la pantalla lo refleja sin recargar.

Las **escrituras que mueven dinero o inventario** son llamadas a Cloud Functions
(`src/api/functions.ts`). El navegador nunca calcula totales ni descuenta stock.

La sesión la mantiene el SDK de Firebase; el rol viaja en los *custom claims*
del token y `AuthContext` lo lee de ahí. No se guarda nada en `localStorage` a
mano.

## Puesta en marcha

1. Copia `.env.example` como `.env`.
2. Llénalo con la configuración web de tu proyecto (consola de Firebase →
   Configuración del proyecto → Tus apps → App web). Esos valores son públicos
   por diseño: quien protege los datos son las reglas de Firestore.
3. Ejecuta:

```bash
npm install
```

```bash
npm run dev
```

Vite sirve la aplicación en `http://localhost:5173`.

Para trabajar contra los emuladores en lugar del proyecto real, pon
`VITE_USE_FIREBASE_EMULATORS=true` y levántalos desde `soulbrew.backend`.

## Scripts

- `npm run dev`: entorno de desarrollo.
- `npm run build`: validación TypeScript y bundle de producción.
- `npm run check`: validación TypeScript.
- `npm run preview`: vista previa del bundle.

Los archivos `.env` están ignorados por Git; `.env.example` sí debe versionarse.
