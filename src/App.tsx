import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { InternalView } from "./views/InternalView";
import { LoginView } from "./views/LoginView";
import { PublicView } from "./views/PublicView";

export default function App() {
  return (
    // BASE_URL es "/" en Firebase Hosting/Netlify y "/soulbrew.frontend/" en
    // GitHub Pages (lo fija vite.config.ts según dónde se construya). Sin
    // basename, las rutas no coincidirían bajo ese subdirectorio.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PublicView />} />
          <Route path="/login" element={<LoginView />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/interna" element={<InternalView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

