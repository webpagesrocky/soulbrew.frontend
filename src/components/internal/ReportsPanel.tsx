import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  fetchMonthlySales,
  fetchOrdersBetween,
  MONTH_PAGE_SIZE,
  ORDERS_PAGE_SIZE,
  startOfDay,
  startOfMonth,
  subscribeCategories,
  subscribeOrdersBetween,
  subscribeProducts,
  subscribeSupplies,
  subscribeSupplyMovements,
  type MonthSales,
} from "../../api/collections";
import { costTable, unitCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import type { Category, Order, Product, Supply, SupplyMovement, User } from "../../types";
import { Icon } from "../Icon";
import { SuppliesSection } from "./SuppliesSection";
import { SupplyForecast } from "./SupplyForecast";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const methodLabel = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia" } as const;

/** Lunes de la semana a la que pertenece `date`. */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const weekday = (start.getDay() + 6) % 7; // 0 = lunes
  start.setDate(start.getDate() - weekday);
  return start;
}

/** "noviembre de 2026" -> "Noviembre de 2026". Sólo la primera letra: el CSS
 *  `capitalize` toca cada palabra y deja "Noviembre De 2026". */
function monthLabel(date: Date): string {
  const text = date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Una celda lista para CSV.
 *
 * Se usa punto y coma como separador porque es lo que Excel en español espera
 * al abrir el archivo de doble clic; Google Sheets lo detecta igual. Las
 * comillas dentro del texto se duplican, que es como manda el formato.
 */
function csvCell(value: string | number): string {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

/** Dispara la descarga de un texto como archivo, sin pasar por ningún servidor. */
function descargarTexto(nombre: string, contenido: string) {
  // El BOM es lo que hace que Excel lea los acentos bien en vez de "Fr√≠o".
  const blob = new Blob([`﻿${contenido}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
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
  // Abre en Ventas: es lo que se consulta a diario. Antes abría en Inventario
  // y las ventas del mes quedaban escondidas detrás de una pestaña.
  const [view, setView] = useState<"sales" | "inventory">("sales");
  const [bajando, setBajando] = useState<string>("");
  const [inventoryTab, setInventoryTab] = useState<"forecast" | "supplies">("forecast");
  // El mes es lo que se compara contra el banco y contra lo que la dueña
  // cuenta, así que es el periodo por defecto; la semana sigue disponible.
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [offset, setOffset] = useState(0);
  const [months, setMonths] = useState<MonthSales[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const range = useMemo(() => {
    if (period === "month") {
      const from = addMonths(startOfMonth(new Date()), offset);
      return { from, to: addMonths(from, 1) };
    }
    const from = addDays(startOfWeek(new Date()), offset * 7);
    return { from, to: addDays(from, 7) };
  }, [period, offset]);

  // Un mes no cabe en el tope de la semana: octubre de 2026 fueron 600
  // pedidos. Si aun así se llena, se avisa en vez de enseñar un mes a medias.
  const maxOrders = period === "month" ? MONTH_PAGE_SIZE : ORDERS_PAGE_SIZE;
  const truncated = orders.length >= maxOrders;

  useEffect(
    () =>
      subscribeOrdersBetween(
        range.from,
        range.to,
        setOrders,
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las ventas")),
        maxOrders,
      ),
    [range, maxOrders],
  );

  // El resumen de los últimos doce meses: una lectura por mes, y la cuenta la
  // hace el servidor. Sólo se pide cuando se está viendo Ventas.
  useEffect(() => {
    if (view !== "sales") return;
    let vigente = true;
    fetchMonthlySales(12)
      .then((rows) => {
        if (vigente) setMonths(rows);
      })
      .catch(() => {
        if (vigente) setMonths(null);
      });
    return () => {
      vigente = false;
    };
  }, [view]);

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

  /**
   * Baja un mes entero como CSV: primero el resumen y luego un renglón por
   * bebida pedida, con su personalización y de dónde sale su precio.
   *
   * Los pedidos se piden aquí en vez de usar los que ya están en pantalla,
   * para poder bajar cualquier mes sin tener que abrirlo antes.
   */
  async function descargarMes(desde: Date) {
    const clave = desde.toISOString();
    setBajando(clave);
    setError("");
    try {
      const hasta = addMonths(desde, 1);
      const pedidos = await fetchOrdersBetween(desde, hasta);
      const pagados = pedidos.filter((order) => order.status === "PAID");
      const porMetodo = { CASH: 0, CARD: 0, TRANSFER: 0 };
      for (const order of pagados) {
        if (order.paymentMethod) porMetodo[order.paymentMethod] += order.total;
      }
      const total = pagados.reduce((suma, order) => suma + order.total, 0);

      const filas: (string | number)[][] = [
        [`Soul Brew - ventas de ${monthLabel(desde)}`],
        [],
        ["Pedidos cobrados", pagados.length],
        ["Efectivo", porMetodo.CASH],
        ["Tarjeta", porMetodo.CARD],
        ["Transferencia", porMetodo.TRANSFER],
        ["VENTA TOTAL", total],
        ["Cancelados", pedidos.filter((order) => order.status === "CANCELLED").length],
        [],
        ["Código", "Fecha", "Hora", "Estado", "Forma de pago", "Cliente",
         "Producto", "Personalización", "Cantidad", "Precio base", "Extras",
         "Precio unitario", "Subtotal", "Total del ticket"],
      ];
      for (const order of pedidos) {
        for (const item of order.items) {
          const extras = item.options.reduce((suma, opcion) => suma + opcion.priceDelta, 0);
          filas.push([
            order.code,
            order.createdAt?.toLocaleDateString("es-MX") ?? "",
            order.createdAt?.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) ?? "",
            order.status === "PAID" ? "Pagado" : order.status === "PENDING" ? "Pendiente" : "Cancelado",
            order.paymentMethod ? methodLabel[order.paymentMethod] : "",
            order.customerName,
            item.productName,
            item.options
              .map((o) => o.optionName + (o.priceDelta ? ` (+$${o.priceDelta})` : ""))
              .join(", "),
            item.quantity,
            item.unitPrice - extras,
            extras,
            item.unitPrice,
            item.subtotal,
            order.total,
          ]);
        }
      }
      const mes = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}`;
      descargarTexto(`SoulBrew ventas ${mes}.csv`, csvRows(filas));
      setMessage(`Se bajó ${monthLabel(desde)}: ${pagados.length} pedidos, ${money.format(total)}.`);
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo bajar el mes"));
    } finally {
      setBajando("");
    }
  }

  const rangeText = `${range.from.toLocaleDateString("es-MX")} – ${addDays(range.to, -1).toLocaleDateString("es-MX")}`;
  const monthName = monthLabel(range.from);
  const label =
    period === "month"
      ? offset === 0
        ? `Este mes · ${monthName}`
        : monthName
      : offset === 0
        ? "Esta semana"
        : offset === -1
          ? "Semana pasada"
          : rangeText;

  const cards = [
    { label: "Ventas", value: money.format(data.revenue), icon: "sales" as const, tone: "green" },
    { label: "Costo", value: money.format(data.cost), icon: "coffee" as const, tone: "brown" },
    { label: "Ganancia bruta", value: money.format(data.grossProfit), icon: "trend" as const, tone: "green" },
    { label: "Merma (costo)", value: money.format(data.wasteCost), icon: "clock" as const, tone: "amber" },
    { label: "Ganancia neta", value: money.format(data.netProfit), icon: "check" as const, tone: "brown" },
  ];

  return (
    <section className="reference-panel print-area">
      <div className="panel-heading reference-heading-row">
        <div className="reference-heading">
          <h1>
            {view === "sales" ? (period === "month" ? "Reporte mensual" : "Reporte semanal") : "Inventario"}
          </h1>
          <p>
            {view === "sales" ? rangeText : "Lo que el negocio compra y almacena: insumos de barra."}
          </p>
        </div>
        <div className="segmented">
          <button
            className={view === "inventory" ? "active" : ""}
            onClick={() => setView("inventory")}
          >
            Inventario
          </button>
          <button
            className={view === "sales" ? "active" : ""}
            onClick={() => setView("sales")}
          >
            Ventas
          </button>
        </div>
      </div>

      {view === "sales" && (
        <>
          <div className="segmented period-switch">
            <button
              className={period === "month" ? "active" : ""}
              onClick={() => {
                setPeriod("month");
                setOffset(0);
              }}
            >
              Por mes
            </button>
            <button
              className={period === "week" ? "active" : ""}
              onClick={() => {
                setPeriod("week");
                setOffset(0);
              }}
            >
              Por semana
            </button>
          </div>
          <div className="week-nav">
            <button onClick={() => setOffset((value) => value - 1)}>← Anterior</button>
            <strong>{label}</strong>
            <button disabled={offset >= 0} onClick={() => setOffset((value) => value + 1)}>
              Siguiente →
            </button>
          </div>
        </>
      )}

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      {view === "sales" && (
        <>
      {truncated && (
        <div className="notice error">
          Este periodo tiene más de {maxOrders} pedidos y sólo se alcanzaron a cargar los más
          recientes, así que las cifras de abajo salen incompletas. Revísalo por semana.
        </div>
      )}

      {data.missingCost > 0 && (
        <div className="notice error">
          {data.missingCost} {data.missingCost === 1 ? "producto vendido no tiene" : "productos vendidos no tienen"}{" "}
          costo, así que su ganancia se está contando completa. Ponles receta en Menú (botón
          "Receta" del producto o de su categoría) para que el costo salga solo de los insumos.
        </div>
      )}

      <article className="reference-card month-card">
        <div className="card-heading">
          <h2>Ventas por mes</h2>
          <span>Toca un mes para verlo con detalle, o bájalo a Excel</span>
        </div>
        {months === null && <p className="reference-empty">No se pudo cargar el resumen.</p>}
        {months
          ?.filter((row) => row.count > 0)
          .map((row) => {
            const abierto = period === "month" && row.from.getTime() === range.from.getTime();
            return (
              <div className={`month-row${abierto ? " active" : ""}`} key={row.from.toISOString()}>
                <button
                  className="month-pick"
                  onClick={() => {
                    setPeriod("month");
                    setOffset(
                      (row.from.getFullYear() - new Date().getFullYear()) * 12 +
                        (row.from.getMonth() - new Date().getMonth()),
                    );
                  }}
                >
                  <span className="month-name">{monthLabel(row.from)}</span>
                  <small>{row.count} pedidos</small>
                </button>
                <strong className="month-total">{money.format(row.total)}</strong>
                <button
                  className="month-download"
                  disabled={bajando === row.from.toISOString()}
                  onClick={() => void descargarMes(row.from)}
                >
                  {bajando === row.from.toISOString() ? "Bajando…" : "Excel"}
                </button>
              </div>
            );
          })}
        {months?.every((row) => row.count === 0) && (
          <p className="reference-empty">Todavía no hay ventas registradas.</p>
        )}
      </article>

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
              <p className="reference-empty">
                No hubo ventas en {period === "month" ? "este mes" : "esta semana"}.
              </p>
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
          <span>Merma {period === "month" ? "del mes" : "de la semana"}: {money.format(data.wasteCost)}</span>
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
            <p className="reference-empty">
              Sin movimientos de insumos en {period === "month" ? "este mes" : "esta semana"}.
            </p>
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
