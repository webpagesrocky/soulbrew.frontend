import { useEffect, useState } from "react";
import { subscribeOrders } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { cancelOrder, payOrder } from "../../api/transactions";
import type { Order, OrderStatus, PaymentMethod, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const statusLabel: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

export function OrdersPanel({ user }: { user: User }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "">("PENDING");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Suscripción en vivo: las órdenes que entran desde el menú público aparecen
  // solas, y al cobrar una el cambio de estado se refleja sin recargar.
  useEffect(
    () =>
      subscribeOrders(
        filter,
        (rows) => {
          setOrders(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudieron cargar los pedidos")),
      ),
    [filter],
  );

  async function pay(id: string, paymentMethod: PaymentMethod) {
    setBusy(id);
    try {
      await payOrder(id, paymentMethod, { uid: user.id, name: user.name });
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo cobrar la orden"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    const reason = window.prompt("Motivo de la cancelación (mínimo 5 caracteres):");
    if (!reason) return;
    setBusy(id);
    try {
      await cancelOrder(id, reason, { uid: user.id, name: user.name });
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo cancelar la orden"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="reference-panel">
      <div className="panel-heading reference-heading-row">
        <div className="reference-heading">
          <h1>Pedidos</h1>
          <p>Recibe, cobra y da seguimiento a las órdenes.</p>
        </div>
        <div className="segmented">
          {(["PENDING", "PAID", "CANCELLED", ""] as const).map((value) => (
            <button
              className={filter === value ? "active" : ""}
              key={value || "ALL"}
              onClick={() => setFilter(value)}
            >
              {value ? statusLabel[value] : "Todos"}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="order-grid">
        {orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-top">
              <div>
                <span className="order-code">{order.code}</span>
                <h3>{order.customerName}</h3>
              </div>
              <span className={`status ${order.status.toLowerCase()}`}>
                {statusLabel[order.status]}
              </span>
            </div>
            <div className="order-items">
              {order.items.map((item) => (
                <p key={item.productId}>
                  <span>
                    {item.quantity} × {item.productName}
                  </span>
                  <span>{money.format(item.subtotal)}</span>
                </p>
              ))}
            </div>
            <div className="order-total">
              <span>Total</span>
              <strong>{money.format(order.total)}</strong>
            </div>
            {order.status === "PENDING" && (
              <div className="order-actions">
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "CASH")}>
                  Efectivo
                </button>
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "CARD")}>
                  Tarjeta
                </button>
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "TRANSFER")}>
                  Transferencia
                </button>
              </div>
            )}
            {order.paymentMethod && <small>Pago: {order.paymentMethod}</small>}
            {user.role === "ADMIN" && order.status !== "CANCELLED" && (
              <button
                className="danger-link"
                disabled={busy === order.id}
                onClick={() => void cancel(order.id)}
              >
                Cancelar orden
              </button>
            )}
          </article>
        ))}
        {!orders.length && <div className="empty-state">No hay pedidos en esta categoría.</div>}
      </div>
    </section>
  );
}
