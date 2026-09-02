import { useEffect, useMemo, useState } from "react";
import {
  startOfDay,
  subscribeCategories,
  subscribeOrdersBetween,
  subscribeProducts,
  subscribeSupplies,
  subscribeSupplyMovements,
} from "../../api/collections";
import { costTable, unitCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import type { Category, Order, Product, Supply, SupplyMovement, User } from "../../types";
import { Icon } from "../Icon";
import { SuppliesSection } from "./SuppliesSection";
import { SupplyForecast } from "./SupplyForecast";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Lunes de la semana a la que pertenece `date`. */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = (start.getDay() + 6) % 7; // 0 = lunes
  start.setDate(start.getDate() - weekday);
  return start;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Reporte semanal: ventas, costo, ganancia y movimientos de inventario.
 *
 * Todo se calcula aquí a partir de los pedidos y la bitácora del rango. No se
 * guardan totales precalculados a propósito: si mañana se cancela una venta de
 * esta semana, el reporte se corrige solo en vez de quedar desfasado.
 */
export function ReportsPanel({ user }: { user: User }) {
  const [view, setView] = useState<"sales" | "inventory">("sales");
  const [inventoryTab, setInventoryTab] = useState<"forecast" | "supplies">("forecast");
  const [weekOffset, setWeekOffset] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const range = useMemo(() => {
    const from = addDays(startOfWeek(new Date()), weekOffset * 7);
    return { from, to: addDays(from, 7) };
  }, [weekOffset]);

  useEffect(
    () =>
      subscribeOrdersBetween(
        range.from,
        range.to,
        setOrders,
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las ventas")),
      ),
    [range],
  );

  useEffect(
    () =>
      subscribeSupplyMovements(
        setMovements,
        (reason) => setError(errorMessage(reason, "No se pudo cargar el inventario")),
        range.from,
      ),
    [range],
  );

  useEffect(
    () =>
      subscribeProducts(
        setProducts,
        (reason) => setError(errorMessage(reason, "No se pudo cargar el catálogo")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeCategories(
        setCategories,
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeSupplies(
        setSupplies,
        (reason) => setError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [],
  );

  const data = useMemo(() => {
    const paid = orders.filter((order) => order.status === "PAID");
    // El costo sale de la receta y del precio real de los insumos; el capturado
    // a mano sólo se usa mientras el producto no tenga receta.
    const costOf = costTable(products, categories, supplies);

    let revenue = 0;
    let cost = 0;
    const byMethod = { CASH: 0, CARD: 0, TRANSFER: 0 };
    const byProduct = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    const byDay = new Map<string, number>();

    for (const order of paid) {
      revenue += order.total;
      if (order.paymentMethod) byMethod[order.paymentMethod] += order.total;

      if (order.createdAt) {
        const key = order.createdAt.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
        byDay.set(key, (byDay.get(key) ?? 0) + order.total);
      }

      for (const item of order.items) {
        const unitCost = costOf.get(item.productId) ?? 0;
        const lineCost = unitCost * item.quantity;
        cost += lineCost;

        const entry = byProduct.get(item.productId) ?? {
          name: item.productName,
          qty: 0,
          revenue: 0,
          cost: 0,
        };
        entry.qty += item.quantity;
        entry.revenue += item.subtotal;
        entry.cost += lineCost;
        byProduct.set(item.productId, entry);
      }
    }

    // La merma se valora al costo del insumo perdido: la leche que se derramó,
    // el vaso que se rompió. No es lo que se habría cobrado por una bebida que
    // nunca se vendió.
    const costOfSupply = new Map(supplies.map((supply) => [supply.id, unitCost(supply)]));
    const wasteMovements = movements.filter((movement) => movement.type === "WASTE");
    const wasteCost = wasteMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantityChange) * (costOfSupply.get(m.supplyId) ?? 0),
      0,
    );

    const adjustments = movements.filter((movement) => movement.type !== "WASTE");
    const cancelled = orders.filter((order) => order.status === "CANCELLED");

    return {
      paidCount: paid.length,
      revenue,
      cost,
      grossProfit: revenue - cost,
      netProfit: revenue - cost - wasteCost,
      byMethod,
      byDay: [...byDay.entries()],
      topProducts: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue),
      wasteMovements,
      wasteCost,
      adjustments,
      cancelledCount: cancelled.length,
      missingCost: [...byProduct.entries()].filter(([id]) => !costOf.get(id)).length,
    };
  }, [orders, movements, products, categories, supplies]);

  const label =
    weekOffset === 0
      ? "Esta semana"
      : weekOffset === -1
        ? "Semana pasada"
        : `${range.from.toLocaleDateString("es-MX")} – ${addDays(range.to, -1).toLocaleDateString("es-MX")}`;

  const cards = [
    { label: "Ventas", value: money.format(data.revenue), icon: "sales" as const, tone: "green" },
    { label: "Costo", value: money.format(data.cost), icon: "coffee" as const, tone: "brown" },
    { label: "Ganancia bruta", value: money.format(data.grossProfit), icon: "trend" as const, tone: "green" },
    { label: "Merma (costo)", value: money.format(data.wasteCost), icon: "clock" as const, tone: "amber" },
    { label: "Ganancia neta", value: money.format(data.netProfit), icon: "check" as const, tone: "brown" },
  ];

  return (
    <section className="reference-panel">
      <div className="panel-heading reference-heading-row">
        <div className="reference-heading">
          <h1>{view === "sales" ? "Reporte semanal" : "Inventario"}</h1>
          <p>
            {view === "sales"
              ? `${range.from.toLocaleDateString("es-MX")} – ${addDays(range.to, -1).toLocaleDateString("es-MX")}`
              : "Lo que el negocio compra y almacena: insumos de barra."}
          </p>
        </div>
        <div className="segmented">
          <button
            className={view === "sales" ? "active" : ""}
            onClick={() => setView("sales")}
          >
            Ventas
          </button>
          <button
            className={view === "inventory" ? "active" : ""}
            onClick={() => setView("inventory")}
          >
            Inventario
          </button>
        </div>
      </div>

      {view === "sales" && (
        <div className="week-nav">
          <button onClick={() => setWeekOffset((value) => value - 1)}>← Anterior</button>
          <strong>{label}</strong>
          <button disabled={weekOffset >= 0} onClick={() => setWeekOffset((value) => value + 1)}>
            Siguiente →
          </button>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      {view === "sales" && (
        <>
      {data.missingCost > 0 && (
        <div className="notice error">
          {data.missingCost} {data.missingCost === 1 ? "producto vendido no tiene" : "productos vendidos no tienen"}{" "}
          costo, así que su ganancia se está contando completa. Ponles receta en Menú (botón
          "Receta" del producto o de su categoría) para que el costo salga solo de los insumos.
        </div>
      )}

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
        <article className="reference-card">
          <div className="card-heading">
            <h2>Ventas por producto</h2>
            <span>{data.paidCount} ventas</span>
          </div>
          <div className="report-table">
            <div className="report-head">
              <span>Producto</span>
              <span>Uds</span>
              <span>Venta</span>
              <span>Costo</span>
              <span>Ganancia</span>
            </div>
            {data.topProducts.map((row) => (
              <div className="report-row" key={row.name}>
                <span>{row.name}</span>
                <span>{row.qty}</span>
                <span>{money.format(row.revenue)}</span>
                <span>{money.format(row.cost)}</span>
                <strong>{money.format(row.revenue - row.cost)}</strong>
              </div>
            ))}
            {!data.topProducts.length && (
              <p className="reference-empty">No hubo ventas en esta semana.</p>
            )}
          </div>
        </article>

        <div className="report-side">
          <article className="reference-card">
            <h2>Cobros</h2>
            <div className="report-line"><span>Efectivo</span><strong>{money.format(data.byMethod.CASH)}</strong></div>
            <div className="report-line"><span>Tarjeta</span><strong>{money.format(data.byMethod.CARD)}</strong></div>
            <div className="report-line"><span>Transferencia</span><strong>{money.format(data.byMethod.TRANSFER)}</strong></div>
            <div className="report-line"><span>Canceladas</span><strong>{data.cancelledCount}</strong></div>
          </article>

          <article className="reference-card">
            <h2>Por día</h2>
            {data.byDay.map(([day, amount]) => (
              <div className="report-line" key={day}>
                <span>{day}</span>
                <strong>{money.format(amount)}</strong>
              </div>
            ))}
            {!data.byDay.length && <p className="reference-empty">Sin movimiento.</p>}
          </article>
        </div>
      </div>

      <article className="reference-card">
        <div className="card-heading">
          <h2>Movimientos de insumos</h2>
          <span>Merma de la semana: {money.format(data.wasteCost)}</span>
        </div>
        <div className="report-table">
          <div className="report-head">
            <span>Insumo</span>
            <span>Tipo</span>
            <span>Cant.</span>
            <span>Motivo</span>
            <span>Quién</span>
          </div>
          {[...data.wasteMovements, ...data.adjustments].map((movement) => (
            <div className="report-row" key={movement.id}>
              <span>{movement.supplyName}</span>
              <span>
                {movement.type === "WASTE"
                  ? "Merma"
                  : movement.type === "PURCHASE"
                    ? "Compra"
                    : "Ajuste"}
              </span>
              <span className={movement.quantityChange > 0 ? "stock-in" : "stock-out"}>
                {movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange}{" "}
                {movement.unit}
              </span>
              <span>{movement.reason}</span>
              <span>{movement.userName}</span>
            </div>
          ))}
          {!data.wasteMovements.length && !data.adjustments.length && (
            <p className="reference-empty">Sin movimientos de insumos esta semana.</p>
          )}
        </div>
      </article>

      <div className="report-print">
        <button className="reference-primary" onClick={() => window.print()}>
          Imprimir reporte
        </button>
      </div>
        </>
      )}

      {view === "inventory" && (
        <>
          <div className="inventory-tabs">
            <button
              className={inventoryTab === "forecast" ? "active" : ""}
              onClick={() => setInventoryTab("forecast")}
            >
              Qué comprar
            </button>
            <button
              className={inventoryTab === "supplies" ? "active" : ""}
              onClick={() => setInventoryTab("supplies")}
            >
              Insumos
            </button>
          </div>

          {inventoryTab === "forecast" && <SupplyForecast onError={setError} />}

          {inventoryTab === "supplies" && (
            <SuppliesSection
              user={user}
              from={range.from}
              onError={setError}
              onMessage={(text) => {
                setMessage(text);
                setError("");
              }}
            />
          )}

        </>
      )}
    </section>
  );
}
