import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sirve un repositorio de proyecto en
// https://usuario.github.io/nombre-del-repo/, así que los assets necesitan
// ese prefijo. Firebase Hosting y Netlify sirven desde la raíz del dominio,
// así que ahí NO debe llevarlo. El flujo de GitHub Actions activa esta
// variable sólo quien construye para Pages.
const base = process.env.GITHUB_PAGES === "true" ? "/soulbrew.frontend/" : "/";

export default defineConfig({ base, plugins: [react()] });

