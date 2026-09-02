import { useEffect, useMemo, useState } from "react";
import {
  startOfDay,
  subscribeCategories,
  subscribeOrdersBetween,
  subscribeProducts,
  subscribeSupplies,
  subscribeSupplyMovements,
} from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Category, Order, Product, Supply, SupplyMovement } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const PERIOD_DAYS = 14;

/** Unidades que no tienen sentido a medias: no se compra 1.4 vasos. */
const WHOLE_UNITS = new Set(["pz", "cajas", "bolsas"]);

/**
 * Lunes de referencia para cortar los periodos. Sin un ancla fija, "las
 * últimas dos semanas" se recorrería cada día y dos consultas seguidas darían
 * números distintos; con ancla, la quincena siempre empieza el mismo lunes.
 */
const EPOCH_MONDAY = new Date(2024, 0, 1);

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Inicio del bloque de 14 días al que pertenece hoy, más `offset` bloques. */
function periodStart(offset: number): Date {
  const thisMonday = startOfWeek(new Date());
  const weeks = Math.floor((thisMonday.getTime() - EPOCH_MONDAY.getTime()) / (7 * 86_400_000));
  const block = Math.floor(weeks / 2) + offset;
  return addDays(EPOCH_MONDAY, block * PERIOD_DAYS);
}

function roundUp(value: number, unit: string): number {
  if (WHOLE_UNITS.has(unit)) return Math.ceil(value);
  return Math.ceil(value * 100) / 100;
}

interface Props {
  onError: (message: string) => void;
}

/**
 * Qué comprar en la próxima quincena.
 *
 * El consumo no se lee de la bitácora: se recalcula multiplicando lo que se
 * vendió por la receta de cada categoría. Así una venta cancelada deja de
 * contar sola, igual que en el reporte de ventas, en vez de quedar un
 * movimiento fantasma que nadie corrige.
 */
export function SupplyForecast({ onError }: Props) {
  const [offset, setOffset] = useState(0);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);

  const range = useMemo(() => {
    const from = periodStart(offset);
    return { from, to: addDays(from, PERIOD_DAYS) };
  }, [offset]);

  useEffect(
    () =>
      subscribeSupplies(setSupplies, (reason) =>
        onError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [onError],
  );

  useEffect(
    () =>
      subscribeCategories(setCategories, (reason) =>
        onError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [onError],
  );

  useEffect(
    () =>
      subscribeProducts(setProducts, (reason) =>
        onError(errorMessage(reason, "No se pudo cargar el catálogo")),
      ),
    [onError],
  );

  useEffect(
    () =>
      subscribeOrdersBetween(range.from, range.to, setOrders, (reason) =>
        onError(errorMessage(reason, "No se pudieron cargar las ventas")),
      ),
    [range, onError],
  );

  useEffect(
    () =>
      subscribeSupplyMovements(
        setMovements,
        (reason) => onError(errorMessage(reason, "No se pudo cargar la bitácora de insumos")),
        range.from,
      ),
    [range, onError],
  );

  const rows = useMemo(() => {
    const categoryOfProduct = new Map(products.map((product) => [product.id, product.category]));
    const recipeOfCategory = new Map(categories.map((category) => [category.id, category.recipe]));

    // Consumo del periodo = ventas cobradas × receta de su categoría.
    const consumed = new Map<string, number>();
    for (const order of orders) {
      if (order.status !== "PAID") continue;
      for (const item of order.items) {
        const category = categoryOfProduct.get(item.productId);
        for (const ingredient of recipeOfCategory.get(category ?? "") ?? []) {
          const total =
            (consumed.get(ingredient.supplyId) ?? 0) + ingredient.quantity * item.quantity;
          consumed.set(ingredient.supplyId, total);
        }
      }
    }

    // Compras del periodo: sólo las entradas, y sólo las que caen dentro del
    // rango (la suscripción trae desde `from` sin tope superior).
    const purchased = new Map<string, number>();
    for (const movement of movements) {
      if (movement.quantityChange <= 0) continue;
      const at = movement.createdAt;
      if (!at || at < range.from || at >= range.to) continue;
      purchased.set(movement.supplyId, (purchased.get(movement.supplyId) ?? 0) + movement.quantityChange);
    }

    return supplies
      .filter((supply) => supply.active)
      .map((supply) => {
        const used = Math.round((consumed.get(supply.id) ?? 0) * 100) / 100;
        const bought = Math.round((purchased.get(supply.id) ?? 0) * 100) / 100;
        const perDay = used / PERIOD_DAYS;
        // Se proyecta que la próxima quincena consuma lo mismo que ésta, y se
        // pide lo que falte para cubrirla dejando el mínimo de reserva.
        const suggested = roundUp(Math.max(0, used + supply.minStock - supply.stock), supply.unit);
        const daysLeft = perDay > 0 ? supply.stock / perDay : null;
        return {
          supply,
          used,
          bought,
          suggested,
          suggestedCost: suggested * supply.cost,
          daysLeft,
          low: supply.minStock > 0 && supply.stock <= supply.minStock,
          // Se queda corto antes de que termine la próxima quincena.
          runsOut: daysLeft !== null && daysLeft < PERIOD_DAYS,
        };
      })
      .sort((a, b) => b.suggestedCost - a.suggestedCost || b.used - a.used);
  }, [supplies, categories, products, orders, movements, range]);

  const shoppingList = rows.filter((row) => row.suggested > 0);
  const totals = {
    cost: shoppingList.reduce((sum, row) => sum + row.suggestedCost, 0),
    urgent: rows.filter((row) => row.low || row.runsOut).length,
    consumedCost: rows.reduce((sum, row) => sum + row.used * row.supply.cost, 0),
    boughtCost: rows.reduce((sum, row) => sum + row.bought * row.supply.cost, 0),
  };

  const withRecipe = categories.filter((category) => category.recipe.length > 0).length;
  const periodLabel = `${range.from.toLocaleDateString("es-MX")} – ${addDays(range.to, -1).toLocaleDateString("es-MX")}`;

  return (
    <>
      <div className="week-nav">
        <button onClick={() => setOffset((value) => value - 1)}>← Quincena anterior</button>
        <strong>{offset === 0 ? `Esta quincena · ${periodLabel}` : periodLabel}</strong>
        <button disabled={offset >= 0} onClick={() => setOffset((value) => value + 1)}>
          Siguiente →
        </button>
      </div>

      {withRecipe === 0 && (
        <div className="notice error">
          Ninguna categoría tiene receta todavía, así que el consumo sale en cero. Ponle receta a
          cada una en Menú → Categorías → Receta para que vender descuente los insumos solo.
        </div>
      )}

      <div className="metric-grid inventory-metrics">
        <article className="metric-card">
          <div className="metric-icon amber"><Icon name="clock" size={22} /></div>
          <div>
            <span>Urgentes</span>
            <strong>{totals.urgent}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon brown"><Icon name="coffee" size={22} /></div>
          <div>
            <span>Consumido (costo)</span>
            <strong>{money.format(totals.consumedCost)}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon green"><Icon name="check" size={22} /></div>
          <div>
            <span>Comprado en la quincena</span>
            <strong>{money.format(totals.boughtCost)}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon brown"><Icon name="sales" size={22} /></div>
          <div>
            <span>Compra sugerida</span>
            <strong>{money.format(totals.cost)}</strong>
          </div>
        </article>
      </div>

      <article className="reference-card">
        <div className="card-heading">
          <h2>Qué comprar</h2>
          <span>
            {shoppingList.length} {shoppingList.length === 1 ? "insumo" : "insumos"} ·{" "}
            {money.format(totals.cost)}
          </span>
        </div>
        <div className="report-table">
          <div className="report-head forecast-head">
            <span>Insumo</span>
            <span>Tengo</span>
            <span>Gasté</span>
            <span>Compré</span>
            <span>Alcanza</span>
            <span>Comprar</span>
            <span>Costo</span>
          </div>
          {rows.map((row) => (
            <div className="report-row forecast-head" key={row.supply.id}>
              <span>
                {row.supply.name}
                {row.low && <small className="forecast-flag"> · bajo mínimo</small>}
                {!row.low && row.runsOut && <small className="forecast-flag"> · se acaba</small>}
              </span>
              <strong className={row.low || row.runsOut ? "stock-zero" : ""}>
                {row.supply.stock} {row.supply.unit}
              </strong>
              <span className="stock-out">
                {row.used ? `−${row.used} ${row.supply.unit}` : "—"}
              </span>
              <span className="stock-in">
                {row.bought ? `+${row.bought} ${row.supply.unit}` : "—"}
              </span>
              <span>
                {row.daysLeft === null
                  ? "—"
                  : row.daysLeft >= 99
                    ? "99+ días"
                    : `${Math.floor(row.daysLeft)} días`}
              </span>
              <strong>
                {row.suggested ? `${row.suggested} ${row.supply.unit}` : "—"}
              </strong>
              <span>{row.suggestedCost ? money.format(row.suggestedCost) : "—"}</span>
            </div>
          ))}
          {!rows.length && (
            <p className="reference-empty">
              No hay insumos activos. Agrégalos en la pestaña de Insumos.
            </p>
          )}
        </div>
        <small className="editor-note">
          "Comprar" es un aproximado: asume que la próxima quincena se vende lo mismo que ésta, y
          pide lo que falte para cubrirla dejando tu mínimo de reserva. Se calcula con las ventas
          cobradas y la receta de cada categoría, así que una venta cancelada deja de contar sola.
        </small>
      </article>

      <div className="report-print">
        <button className="reference-primary" onClick={() => window.print()}>
          Imprimir lista de compra
        </button>
      </div>
    </>
  );
}
