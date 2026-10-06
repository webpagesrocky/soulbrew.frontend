import { useEffect, useMemo, useState } from "react";
import { ORDERS_PAGE_SIZE, startOfDay, subscribeOrdersBetween } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { deleteOrder } from "../../api/transactions";
import type { Order, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const statusLabel = { PENDING: "Pendiente", PAID: "Pagada", CANCELLED: "Cancelada" } as const;
/** En el recibo no va "CASH": eso es el nombre interno del método. */
const methodLabel = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

/**
 * Días que se cargan de una vez, y cuántos añade cada "ver más".
 *
 * Antes se pedían 60 días de golpe contra un tope de 500 pedidos. Con 20 o 30
 * ventas diarias eso son unos 20 días: los más viejos se quedaban fuera sin
 * que nada lo dijera, y el encabezado seguía prometiendo 60. En tramos de dos
 * semanas cabe todo con margen, y quien necesite ir más atrás lo pide.
 */
const PAGE_DAYS = 14;

/**
 * Recibos y pedidos día por día, hoy incluido.
 *
 * No hay un proceso que "mueva" los pedidos viejos a otro lado —eso exigiría
 * tareas programadas, que necesitan plan Blaze—: el panel de Pedidos es la
 * barra trabajando sobre lo de hoy y este es el archivo, que los lee todos.
 * Que el día en curso salga en los dos no estorba: son dos cosas distintas.
 */
export function HistoryPanel({ user }: { user: User }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openReceipt, setOpenReceipt] = useState<Order | null>(null);
  // Cada día arranca cerrado: con dos semanas de pedidos abiertos de golpe se
  // vuelve una lista en la que no se encuentra nada. El encabezado ya dice
  // cuántas ventas y cuánto se hizo, que es lo que se viene a ver.
  const [openDays, setOpenDays] = useState<string[]>([]);

  function toggleDay(day: string) {
    setOpenDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  const [days, setDays] = useState(PAGE_DAYS);

  // Hoy también entra: al cerrar la caja se viene aquí a revisar el día que
  // acaba de pasar, y tener que acordarse de que hoy "todavía no es historial"
  // sólo confunde. Sale arriba, como un día más.
  const from = useMemo(() => {
    const start = startOfDay();
    start.setDate(start.getDate() - days + 1);
    return start;
  }, [days]);

  useEffect(
    () =>
      subscribeOrdersBetween(
        from,
        null,
        (rows) => {
          setOrders(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudo cargar el historial")),
      ),
    [from],
  );

  // Si llegaron justo los del tope, la consulta cortó por el extremo viejo y
  // hay días incompletos abajo. Mejor decirlo que enseñar cifras a medias.
  const truncated = orders.length >= ORDERS_PAGE_SIZE;

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
        <p>Recibos y pedidos de los últimos {days} días. Toca un día para abrirlo.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      {truncated && (
        <div className="notice">
          Son demasiados pedidos para enseñarlos juntos: los días más viejos de este tramo pueden
          salir incompletos.
        </div>
      )}

      {byDay.map(([day, dayOrders]) => {
        const paid = dayOrders.filter((order) => order.status === "PAID");
        const dayTotal = paid.reduce((sum, order) => sum + order.total, 0);
        const open = openDays.includes(day);
        return (
          <article className="reference-card history-day" key={day}>
            <button
              type="button"
              className="card-heading day-toggle"
              onClick={() => toggleDay(day)}
              aria-expanded={open}
            >
              <h2>{day}</h2>
              <span>
                {paid.length} {paid.length === 1 ? "venta" : "ventas"} · {money.format(dayTotal)}
                <b className={`history-chevron ${open ? "open" : ""}`} aria-hidden="true">
                  ▾
                </b>
              </span>
            </button>
            <div className="history-orders" hidden={!open}>
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
        <div className="empty-state">No hay pedidos en los últimos {days} días.</div>
      )}

      {/* Sin tope de días: el botón sigue estirando el rango hacia atrás, y si
          algún tramo se pasa del tope de pedidos, el aviso de arriba lo dice. */}
      {!!byDay.length && (
        <div className="history-more">
          <button type="button" onClick={() => setDays((current) => current + PAGE_DAYS)}>
            Ver {PAGE_DAYS} días más
          </button>
        </div>
      )}

      {openReceipt && (
        <div className="cash-report-backdrop" onClick={() => setOpenReceipt(null)}>
          <div className="cash-report" onClick={(event) => event.stopPropagation()}>
            <div className="cash-report-head">
              <p className="eyebrow">Recibo</p>
              <h2>{openReceipt.code}</h2>
              <p>
                {openReceipt.customerName}
                {openReceipt.customerPhone && ` · ${openReceipt.customerPhone}`}
                <br />
                {openReceipt.createdAt?.toLocaleString("es-MX")}
              </p>
            </div>

            <p className="cash-report-section">Productos</p>
            {/* La llave va por posición y no por producto: el mismo producto
                puede venir dos veces con personalizaciones distintas (un matcha
                con lotus y otro con mazapán son dos renglones), y repetir
                llave hace que React mezcle los renglones. */}
            {openReceipt.items.map((item, index) => (
              <div className="cash-report-row receipt-line" key={index}>
                <span>
                  {item.quantity} × {item.productName}
                  {/* Lo elegido se desglosa con su recargo: si no, el renglón
                      cobra $120 por algo que en el menú dice $90 y el recibo no
                      explica de dónde salió la diferencia. */}
                  {item.options.map((option) => (
                    <small key={`${option.groupId}-${option.optionId}`}>
                      + {option.optionName}
                      {option.priceDelta > 0 && ` (${money.format(option.priceDelta)})`}
                    </small>
                  ))}
                  {item.quantity > 1 && <small>{money.format(item.unitPrice)} c/u</small>}
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
              <span>
                {openReceipt.paymentMethod ? methodLabel[openReceipt.paymentMethod] : "—"}
              </span>
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
