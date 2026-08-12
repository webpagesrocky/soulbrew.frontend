import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Order, OrderStatus, PaymentMethod, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const statusLabel: Record<OrderStatus, string> = { PENDING: "Pendiente", PAID: "Pagada", CANCELLED: "Cancelada" };

export function OrdersPanel({ user }: { user: User }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "">("PENDING");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    try {
      const result = await api<{ orders: Order[] }>(`/orders${filter ? `?status=${filter}` : ""}`);
      setOrders(result.orders);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar los pedidos");
    }
  }

  useEffect(() => { void load(); }, [filter]);

  async function pay(id: number, paymentMethod: PaymentMethod) {
    setBusy(id);
    try {
      await api(`/orders/${id}/pay`, { method: "POST", body: JSON.stringify({ paymentMethod }) });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cobrar la orden");
    } finally { setBusy(null); }
  }

  async function cancel(id: number) {
    const reason = window.prompt("Motivo de la cancelación (mínimo 5 caracteres):");
    if (!reason) return;
    setBusy(id);
    try {
      await api(`/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cancelar la orden");
    } finally { setBusy(null); }
  }

  return (
    <section className="reference-panel">
      <div className="panel-heading reference-heading-row">
        <div className="reference-heading"><h1>Pedidos</h1><p>Recibe, cobra y da seguimiento a las órdenes.</p></div>
        <div className="segmented">
          {(["PENDING", "PAID", "CANCELLED", ""] as const).map((value) => (
            <button className={filter === value ? "active" : ""} key={value || "ALL"} onClick={() => setFilter(value)}>
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
              <div><span className="order-code">SB-{String(order.id).padStart(6, "0")}</span><h3>{order.customer_name}</h3></div>
              <span className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span>
            </div>
            <div className="order-items">
              {order.items.map((item) => <p key={item.id}><span>{item.quantity} × {item.product_name}</span><span>{money.format(item.subtotal)}</span></p>)}
            </div>
            <div className="order-total"><span>Total</span><strong>{money.format(order.total)}</strong></div>
            {order.status === "PENDING" && (
              <div className="order-actions">
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "CASH")}>Efectivo</button>
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "CARD")}>Tarjeta</button>
                <button disabled={busy === order.id} onClick={() => void pay(order.id, "TRANSFER")}>Transferencia</button>
              </div>
            )}
            {order.payment_method && <small>Pago: {order.payment_method}</small>}
            {user.role === "ADMIN" && order.status !== "CANCELLED" && (
              <button className="danger-link" disabled={busy === order.id} onClick={() => void cancel(order.id)}>Cancelar orden</button>
            )}
          </article>
        ))}
        {!orders.length && <div className="empty-state">No hay pedidos en esta categoría.</div>}
      </div>
    </section>
  );
}
