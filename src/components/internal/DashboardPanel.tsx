import { useEffect, useMemo, useState } from "react";
import { subscribeOrders } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Order } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function DashboardPanel({ onViewOrders }: { onViewOrders: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeOrders(
        "",
        (rows) => {
          setOrders(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudieron cargar los pedidos")),
      ),
    [],
  );

  const data = useMemo(() => {
    const todayKey = new Date().toDateString();
    const today = orders.filter((order) => order.createdAt?.toDateString() === todayKey);
    const paidToday = today.filter((order) => order.status === "PAID");
    const salesToday = paidToday.reduce((sum, order) => sum + order.total, 0);
    const totalSales = orders
      .filter((order) => order.status === "PAID")
      .reduce((sum, order) => sum + order.total, 0);
    const counts = new Map<string, number>();
    for (const order of paidToday) {
      for (const item of order.items) {
        counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity);
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { today, paidToday, salesToday, totalSales, best };
  }, [orders]);

  const cards = [
    { label: "Pedidos de hoy", value: String(data.today.length), icon: "orders" as const, tone: "brown" },
    { label: "Ventas del día", value: money.format(data.salesToday), icon: "sales" as const, tone: "green" },
    {
      label: "Pendientes",
      value: String(data.today.filter((order) => order.status === "PENDING").length),
      icon: "clock" as const,
      tone: "amber",
    },
    { label: "Completados", value: String(data.paidToday.length), icon: "check" as const, tone: "brown" },
    { label: "Total de ventas", value: money.format(data.totalSales), icon: "trend" as const, tone: "green" },
  ];

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Dashboard</h1>
        <p>Resumen de hoy, actualizado con los pedidos registrados.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="metric-grid">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <div className={`metric-icon ${card.tone}`}>
              <Icon name={card.icon} size={22} />
            </div>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <article className="reference-card recent-orders">
          <div className="card-heading">
            <h2>Pedidos recientes</h2>
            <button onClick={onViewOrders}>Ver todos</button>
          </div>
          <div className="compact-orders">
            {orders.slice(0, 6).map((order) => (
              <div className="compact-order" key={order.id}>
                <div>
                  <strong>
                    {order.code}{" "}
                    <small>
                      ·{" "}
                      {order.createdAt?.toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }) ?? "—"}
                    </small>
                  </strong>
                  <p>
                    {order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
                  </p>
                </div>
                <strong>{money.format(order.total)}</strong>
                <span className={`reference-status ${order.status.toLowerCase()}`}>
                  {order.status === "PENDING"
                    ? "Nuevo"
                    : order.status === "PAID"
                      ? "Completado"
                      : "Cancelado"}
                </span>
              </div>
            ))}
            {!orders.length && <p className="reference-empty">Aún no hay pedidos registrados.</p>}
          </div>
        </article>
        <article className="reference-card best-sellers">
          <h2>Más vendidos hoy</h2>
          {data.best.map(([name, quantity], index) => (
            <div key={name}>
              <span>{index + 1}</span>
              <strong>{name}</strong>
              <small>{quantity} vendidos</small>
            </div>
          ))}
          {!data.best.length && (
            <p className="reference-empty">Las ventas del día aparecerán aquí.</p>
          )}
        </article>
      </div>
    </section>
  );
}
