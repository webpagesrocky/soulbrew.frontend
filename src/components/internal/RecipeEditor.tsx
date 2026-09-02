import { useEffect, useMemo, useState } from "react";
import { subscribeSupplies } from "../../api/collections";
import { unitCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import type { RecipeItem, Supply } from "../../types";

/** Tope por receta. Lo imponen las reglas de Firestore, que la validan
 *  ingrediente por ingrediente porque CEL no tiene bucles. */
const MAX_INGREDIENTS = 8;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

interface Props {
  title: string;
  /** Explica a qué aplica la receta y qué pasa si se deja vacía. */
  hint: React.ReactNode;
  recipe: RecipeItem[];
  /** Receta que se usaría si ésta se deja vacía (la de la categoría). */
  fallback?: { label: string; recipe: RecipeItem[] };
  onSave: (recipe: RecipeItem[]) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
}

/**
 * Editor de receta: qué insumos y cuánto consume **una unidad vendida**.
 *
 * Sirve igual para una categoría (la receta base de toda su familia) y para un
 * producto suelto que lleve algo distinto. De paso va mostrando cuánto cuesta
 * lo que se está armando, que es el número que acaba usando el reporte de
 * ganancias.
 */
export function RecipeEditor({ title, hint, recipe, fallback, onSave, onClose, onError }: Props) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [rows, setRows] = useState<RecipeItem[]>(recipe);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeSupplies(
        (list) => setSupplies(list.filter((item) => item.active)),
        (reason) => onError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [onError],
  );

  const byId = useMemo(() => new Map(supplies.map((supply) => [supply.id, supply])), [supplies]);
  const used = new Set(rows.map((row) => row.supplyId));
  const available = supplies.filter((supply) => !used.has(supply.id));

  const shown = rows.length ? rows : (fallback?.recipe ?? []);
  const inherited = rows.length === 0 && (fallback?.recipe.length ?? 0) > 0;
  const total = shown.reduce((sum, row) => {
    const supply = byId.get(row.supplyId);
    return sum + (supply ? unitCost(supply) * row.quantity : 0);
  }, 0);

  function addRow(supplyId: string) {
    const supply = byId.get(supplyId);
    if (!supply) return;
    setRows((current) => [
      ...current,
      { supplyId: supply.id, supplyName: supply.name, unit: supply.unit, quantity: 1 },
    ]);
  }

  function setQuantity(supplyId: string, quantity: number) {
    setRows((current) =>
      current.map((row) => (row.supplyId === supplyId ? { ...row, quantity } : row)),
    );
  }

  async function save() {
    // Una cantidad en cero haría que vender no descuente nada y las reglas la
    // rechazan, así que se avisa aquí en vez de dejar que falle el guardado.
    if (rows.some((row) => !(row.quantity > 0))) {
      return onError("Cada ingrediente necesita una cantidad mayor que cero.");
    }
    setBusy(true);
    try {
      await onSave(rows);
      onClose();
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo guardar la receta"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div className="editor-card compact-form" onClick={(event) => event.stopPropagation()}>
        <div className="editor-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <p className="editor-note">{hint}</p>

        {inherited && (
          <div className="notice success">
            Hereda la receta de {fallback!.label}. Si agregas ingredientes aquí, esta receta
            reemplaza a la suya por completo.
          </div>
        )}

        <div className="recipe-rows">
          {shown.map((row) => {
            const supply = byId.get(row.supplyId);
            const cost = supply ? unitCost(supply) * row.quantity : 0;
            return (
              <div className="recipe-row" key={row.supplyId}>
                <span className="recipe-name">
                  {row.supplyName}
                  {!supply && <small className="forecast-flag"> · ya no existe</small>}
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={row.quantity}
                  disabled={inherited}
                  onChange={(event) => setQuantity(row.supplyId, Number(event.target.value))}
                  aria-label={`Cantidad de ${row.supplyName}`}
                />
                <span className="recipe-unit">{row.unit}</span>
                <span className="recipe-cost">{supply ? money.format(cost) : "—"}</span>
                <button
                  type="button"
                  className="category-delete"
                  disabled={inherited}
                  onClick={() => setRows((c) => c.filter((r) => r.supplyId !== row.supplyId))}
                  aria-label={`Quitar ${row.supplyName}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {!shown.length && (
            <p className="reference-empty">
              Sin receta: vender esto no descuenta insumos y su costo queda como esté capturado a
              mano.
            </p>
          )}
        </div>

        {shown.length > 0 && (
          <div className="recipe-total">
            <span>Costo por unidad</span>
            <strong>{money.format(total)}</strong>
          </div>
        )}

        {rows.length >= MAX_INGREDIENTS ? (
          <small className="editor-note">Máximo {MAX_INGREDIENTS} insumos por receta.</small>
        ) : (
          <select
            value=""
            onChange={(event) => {
              addRow(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              {available.length
                ? inherited
                  ? "+ Agregar insumo (empieza una receta propia)…"
                  : "+ Agregar insumo…"
                : "No quedan insumos por agregar"}
            </option>
            {available.map((supply) => (
              <option value={supply.id} key={supply.id}>
                {supply.name} ({supply.unit} · {money.format(unitCost(supply))} c/u)
              </option>
            ))}
          </select>
        )}

        {!supplies.length && (
          <small className="editor-note">
            Todavía no hay insumos dados de alta. Créalos en Reportes → Inventario → Insumos.
          </small>
        )}

        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="reference-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar receta"}
          </button>
        </div>
      </div>
    </div>
  );
}
