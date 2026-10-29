import { useEffect, useMemo, useState } from "react";
import { fetchSalesTotal, subscribeOrders } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Order } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function DashboardPanel({ onViewOrders }: { onViewOrders: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  // El total histórico no sale de `orders`: esa lista sólo trae los pedidos
  // más recientes y sumarla daba un total que dejaba de crecer. Lo suma el
  // servidor, y se vuelve a pedir cada vez que entra un pedido.
  const [totalSales, setTotalSales] = useState<number | null>(null);

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

  // Se vuelve a pedir con cada cambio en los pedidos, para que suba en cuanto
  // se cobra algo. Es una sola lectura: la cuenta la hace el servidor.
  const paidCount = orders.filter((order) => order.status === "PAID").length;
  useEffect(() => {
    let vigente = true;
    fetchSalesTotal()
      .then((value) => {
        if (vigente) setTotalSales(value);
      })
      .catch(() => {
        // Si la suma falla, la tarjeta se queda en "—" en vez de inventar un
        // número: más vale no decir nada que decir una cifra que no es.
        if (vigente) setTotalSales(null);
      });
    return () => {
      vigente = false;
    };
  }, [paidCount]);

  const data = useMemo(() => {
    const todayKey = new Date().toDateString();
    const today = orders.filter((order) => order.createdAt?.toDateString() === todayKey);
    const paidToday = today.filter((order) => order.status === "PAID");
    const salesToday = paidToday.reduce((sum, order) => sum + order.total, 0);
    const counts = new Map<string, number>();
    for (const order of paidToday) {
      for (const item of order.items) {
        counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity);
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { today, paidToday, salesToday, best };
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
    {
      label: "Total de ventas",
      value: totalSales === null ? "—" : money.format(totalSales),
      icon: "trend" as const,
      tone: "green",
    },
  ];

  return (
    <>
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
    </>
  );
}
