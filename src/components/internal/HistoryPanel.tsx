import { useEffect, useMemo, useState } from "react";
import { deleteOrder, startOfDay, subscribeOrdersBetween } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Order, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const statusLabel = { PENDING: "Pendiente", PAID: "Pagada", CANCELLED: "Cancelada" } as const;

/** Días hacia atrás que se cargan de golpe. */
const WINDOW_DAYS = 60;

/**
 * Recibos y pedidos de días anteriores.
 *
 * No hay un proceso que "mueva" los pedidos viejos a otro lado —eso exigiría
 * tareas programadas, que necesitan plan Blaze—: simplemente el panel de
 * Pedidos muestra sólo hoy y este muestra lo anterior. El resultado para quien
 * lo usa es el mismo y no hay un trabajo nocturno que se pueda quedar colgado.
 */
export function HistoryPanel({ user }: { user: User }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openReceipt, setOpenReceipt] = useState<Order | null>(null);

  const range = useMemo(() => {
    const today = startOfDay();
    const from = new Date(today);
    from.setDate(from.getDate() - WINDOW_DAYS);
    return { from, to: today };
  }, []);

  useEffect(
    () =>
      subscribeOrdersBetween(
        range.from,
        range.to,
        (rows) => {
          setOrders(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudo cargar el historial")),
      ),
    [range],
  );

  // Los tickets se leen por día, que es como se revisa un historial de caja.
  const byDay = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of orders) {
      if (!order.createdAt) continue;
      const key = order.createdAt.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return [...groups.entries()];
  }, [orders]);

  async function remove(order: Order) {
    if (!window.confirm(`¿Borrar definitivamente el pedido ${order.code}?`)) return;
    setBusy(order.id);
    try {
      await deleteOrder(order.id);
      setOpenReceipt(null);
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo borrar el pedido"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Historial</h1>
        <p>Recibos y pedidos de días anteriores (últimos {WINDOW_DAYS} días).</p>
      </div>
      {error && <div className="notice error">{error}</div>}

      {byDay.map(([day, dayOrders]) => {
        const paid = dayOrders.filter((order) => order.status === "PAID");
        const dayTotal = paid.reduce((sum, order) => sum + order.total, 0);
        return (
          <article className="reference-card history-day" key={day}>
            <div className="card-heading">
              <h2>{day}</h2>
              <span>
                {paid.length} {paid.length === 1 ? "venta" : "ventas"} · {money.format(dayTotal)}
              </span>
            </div>
            <div className="history-orders">
              {dayOrders.map((order) => (
                <div className="history-order" key={order.id}>
                  <div>
                    <strong>{order.code}</strong>
                    <small>
                      {order.customerName} ·{" "}
                      {order.createdAt?.toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                  <span className={`reference-status ${order.status.toLowerCase()}`}>
                    {statusLabel[order.status]}
                  </span>
                  <strong>{money.format(order.total)}</strong>
                  <button className="product-edit" onClick={() => setOpenReceipt(order)}>
                    Recibo
                  </button>
                </div>
              ))}
            </div>
          </article>
        );
      })}

      {!byDay.length && !error && (
        <div className="empty-state">Todavía no hay pedidos de días anteriores.</div>
      )}

      {openReceipt && (
        <div className="cash-report-backdrop" onClick={() => setOpenReceipt(null)}>
          <div className="cash-report" onClick={(event) => event.stopPropagation()}>
            <div className="cash-report-head">
              <p className="eyebrow">Recibo</p>
              <h2>{openReceipt.code}</h2>
              <p>
                {openReceipt.customerName}
                <br />
                {openReceipt.createdAt?.toLocaleString("es-MX")}
              </p>
            </div>

            <p className="cash-report-section">Productos</p>
            {openReceipt.items.map((item) => (
              <div className="cash-report-row" key={item.productId}>
                <span>
                  {item.quantity} × {item.productName}
                </span>
                <span>{money.format(item.subtotal)}</span>
              </div>
            ))}

            <div className="cash-report-row cash-report-diff zero">
              <span>Total</span>
              <span>{money.format(openReceipt.total)}</span>
            </div>

            <p className="cash-report-section">Estado</p>
            <div className="cash-report-row">
              <span>{statusLabel[openReceipt.status]}</span>
              <span>{openReceipt.paymentMethod ?? "—"}</span>
            </div>
            {openReceipt.cancellationReason && (
              <div className="cash-report-row">
                <span>Motivo de cancelación</span>
                <span>{openReceipt.cancellationReason}</span>
              </div>
            )}

            <div className="cash-report-actions">
              <button className="reference-primary" onClick={() => window.print()}>
                Imprimir
              </button>
              <button onClick={() => setOpenReceipt(null)}>Cerrar</button>
            </div>

            {user.role === "ADMIN" && (
              <div className="editor-danger">
                <button
                  type="button"
                  disabled={busy === openReceipt.id}
                  onClick={() => void remove(openReceipt)}
                >
                  Borrar este pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
