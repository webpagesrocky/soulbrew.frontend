import { useEffect, useState } from "react";
import { setCategoryRecipe, subscribeSupplies } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Category, RecipeItem, Supply } from "../../types";

/** Tope por categoría. Lo imponen las reglas de Firestore, que validan la
 *  receta ingrediente por ingrediente porque CEL no tiene bucles. */
const MAX_INGREDIENTS = 8;

interface Props {
  category: Category;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * Receta de una categoría: qué insumos y cuánto consume **cada unidad
 * vendida** de cualquier producto suyo.
 *
 * Vive en la categoría y no en el producto porque las bebidas de una misma
 * familia llevan prácticamente la misma base, y así son 4 recetas que
 * mantener en vez de una por producto del menú.
 */
export function RecipeEditor({ category, onClose, onSaved, onError }: Props) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [rows, setRows] = useState<RecipeItem[]>(category.recipe);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeSupplies(
        (list) => setSupplies(list.filter((item) => item.active)),
        (reason) => onError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [onError],
  );

  const used = new Set(rows.map((row) => row.supplyId));
  const available = supplies.filter((supply) => !used.has(supply.id));

  function addRow(supplyId: string) {
    const supply = supplies.find((item) => item.id === supplyId);
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

  function removeRow(supplyId: string) {
    setRows((current) => current.filter((row) => row.supplyId !== supplyId));
  }

  async function save() {
    // Una cantidad en cero o negativa haría que la venta no descuente nada y
    // las reglas la rechazan, así que se avisa aquí en vez de dejarla fallar.
    if (rows.some((row) => !(row.quantity > 0))) {
      return onError("Cada ingrediente necesita una cantidad mayor que cero.");
    }
    setBusy(true);
    try {
      await setCategoryRecipe(category.id, rows);
      onSaved(
        rows.length
          ? `Receta de "${category.name}" guardada: ${rows.length} ${rows.length === 1 ? "insumo" : "insumos"} por unidad vendida.`
          : `"${category.name}" ya no descuenta insumos al vender.`,
      );
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
          <h2>
            Receta · {category.emoji} {category.name}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <p className="editor-note">
          Lo que consume <strong>una unidad vendida</strong> de esta categoría. Al cobrar un pedido se
          descuenta solo de los insumos.
        </p>

        <div className="recipe-rows">
          {rows.map((row) => (
            <div className="recipe-row" key={row.supplyId}>
              <span className="recipe-name">{row.supplyName}</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={row.quantity}
                onChange={(event) => setQuantity(row.supplyId, Number(event.target.value))}
                aria-label={`Cantidad de ${row.supplyName}`}
              />
              <span className="recipe-unit">{row.unit}</span>
              <button
                type="button"
                className="category-delete"
                onClick={() => removeRow(row.supplyId)}
                aria-label={`Quitar ${row.supplyName}`}
              >
                ✕
              </button>
            </div>
          ))}
          {!rows.length && (
            <p className="reference-empty">
              Sin receta: vender esta categoría no descuenta ningún insumo.
            </p>
          )}
        </div>

        {rows.length >= MAX_INGREDIENTS ? (
          <small className="editor-note">
            Máximo {MAX_INGREDIENTS} insumos por categoría.
          </small>
        ) : (
          <select
            value=""
            onChange={(event) => {
              addRow(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              {available.length ? "+ Agregar insumo…" : "No quedan insumos por agregar"}
            </option>
            {available.map((supply) => (
              <option value={supply.id} key={supply.id}>
                {supply.name} ({supply.unit})
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
          <button type="button" className="reference-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Guardando…" : "Guardar receta"}
          </button>
        </div>
      </div>
    </div>
  );
}
