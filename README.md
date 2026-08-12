# SoulBrew Frontend

Aplicación React + Vite + TypeScript para el punto de venta SoulBrew.

## Vistas

- `/`: menú público, carrito y creación de órdenes para pagar en caja.
- `/login`: acceso del personal mediante JWT.
- `/interna`: panel protegido de pedidos, caja y, según el rol, catálogo, inventario y usuarios.

El token JWT se conserva en `localStorage` para mantener la sesión al recargar. En una etapa posterior puede migrarse a cookies `httpOnly` si frontend y API se publican bajo un mismo dominio.

## Puesta en marcha

1. Copia `.env.example` como `.env`.
2. Ajusta `VITE_API_URL` si el backend no usa `http://localhost:3000/api`.
3. Ejecuta:

```bash
npm install
npm run dev
```

Vite sirve la aplicación en `http://localhost:5173`.

## Scripts

- `npm run dev`: entorno de desarrollo.
- `npm run build`: validación TypeScript y bundle de producción.
- `npm run check`: validación TypeScript.
- `npm run preview`: vista previa del bundle.

Los archivos `.env` están ignorados por Git; `.env.example` sí debe versionarse.
