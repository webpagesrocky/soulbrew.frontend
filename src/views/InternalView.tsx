import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CashPanel } from "../components/internal/CashPanel";
import { CatalogPanel } from "../components/internal/CatalogPanel";
import { DashboardPanel } from "../components/internal/DashboardPanel";
import { OrdersPanel } from "../components/internal/OrdersPanel";
import { TeamPanel } from "../components/internal/TeamPanel";
import { Icon } from "../components/Icon";

type Tab = "dashboard" | "orders" | "catalog" | "cash" | "team";

export function InternalView() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  if (!user) return null;

  const canManage = user.role === "ADMIN" || user.role === "SUPERVISOR";
  return (
    <main className="internal-shell reference-shell">
      <aside className="sidebar reference-sidebar">
        <Link to="/" className="reference-brand"><span><Icon name="coffee" size={17}/></span><strong>Soul Brew</strong></Link>
        <nav>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><Icon name="dashboard"/> Dashboard</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}><Icon name="orders"/> Pedidos</button>
          {canManage && <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}><Icon name="menu"/> Menú</button>}
          <button className={tab === "cash" ? "active" : ""} onClick={() => setTab("cash")}><Icon name="cash"/> Caja</button>
          {canManage && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}><Icon name="team"/> Configuración</button>}
        </nav>
        <div className="reference-sidebar-footer"><Link to="/" target="_blank">Vista previa <Icon name="external" size={14}/></Link><button onClick={logout}><span>{user.name.slice(0, 1).toUpperCase()}</span><Icon name="logout" size={17}/> Cerrar sesión</button></div>
      </aside>
      <div className="internal-content">
        <header className="mobile-header"><span className="reference-brand"><span><Icon name="coffee" size={16}/></span><strong>Soul Brew</strong></span><button onClick={logout}>Salir</button></header>
        {tab === "dashboard" && <DashboardPanel onViewOrders={() => setTab("orders")}/>} 
        {tab === "orders" && <OrdersPanel user={user} />}
        {tab === "cash" && <CashPanel user={user} />}
        {tab === "catalog" && canManage && <CatalogPanel user={user} />}
        {tab === "team" && canManage && <TeamPanel actor={user} />}
      </div>
    </main>
  );
}
