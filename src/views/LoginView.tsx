import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/functions";
import { useAuth } from "../auth/AuthContext";

export function LoginView() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/interna" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate("/interna");
    } catch (reason) {
      setError(errorMessage(reason, "No fue posible iniciar sesión"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-aside">
        <Link to="/" className="brand light"><span>SB</span> SoulBrew</Link>
        <div>
          <p className="eyebrow">Operación interna</p>
          <h1>La barra bajo control.</h1>
          <p>Pedidos, cobros, inventario y cortes en un solo lugar.</p>
        </div>
        <small>Una buena operación también se prepara con cuidado.</small>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">Bienvenido de vuelta</p>
          <h2>Inicia sesión</h2>
          <p className="muted">Usa las credenciales asignadas por tu supervisor.</p>
          {error && <div className="notice error">{error}</div>}
          <label>Correo electrónico</label>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nombre@soulbrew.com" />
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="••••••••••" />
          <button className="primary-button" disabled={loading}>{loading ? "Ingresando…" : "Entrar a SoulBrew"}</button>
          <Link to="/" className="back-link">← Volver al menú público</Link>
        </form>
      </section>
    </main>
  );
}

