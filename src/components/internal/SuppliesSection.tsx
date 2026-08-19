import { useEffect, useMemo, useState } from "react";
import {
  createSupply,
  deleteSupply,
  subscribeSupplies,
  subscribeSupplyMovements,
  updateSupply,
} from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { moveSupply } from "../../api/transactions";
import type { Supply, SupplyMovement, User } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const UNITS = ["pz", "L", "ml", "kg", "g", "cajas", "bolsas"];

interface Props {
  user: User;
  from: Date;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}

/**
 * Insumos de barra: leche, vasos, jarabes.
 *
 * Deliberadamente separado del catálogo del menú: un insumo no se vende, no
 * tiene categoría ni precio de venta, y se mide en litros o kilos en vez de
 * piezas enteras. Mezclarlos obligaría a llenar campos que no aplican.
 */
export function SuppliesSection({ user, from, onError, onMessage }: Props) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Supply | null>(null);

  const canManage = user.role === "ADMIN" || user.role === "SUPERVISOR";

  useEffect(
    () =>
      subscribeSupplies(setSupplies, (reason) =>
        onError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [onError],
  );

  useEffect(
    () =>
      subscribeSupplyMovements(
        setMovements,
        (reason) => onError(errorMessage(reason, "No se pudo cargar la bitácora de insumos")),
        from,
      ),
    [from, onError],
  );

  const totals = useMemo(
    () => ({
      value: supplies.reduce((sum, item) => sum + item.stock * item.cost, 0),
      low: supplies.filter((item) => item.minStock > 0 && item.stock <= item.minStock),
    }),
    [supplies],
  );

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createSupply({
        name: String(data.get("name")).trim(),
        unit: String(data.get("unit")),
        cost: Number(data.get("cost") ?? 0) || 0,
        minStock: Number(data.get("minStock") ?? 0) || 0,
      });
      form.reset();
      onMessage("Insumo agregado. Registra una entrada para darle existencias.");
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo agregar el insumo"));
    } finally {
      setBusy(false);
    }
  }

  async function move(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amount = Number(data.get("quantity"));
    const direction = String(data.get("direction"));
    setBusy(true);
    try {
      await moveSupply(
        String(data.get("supplyId")),
        direction === "OUT" ? -Math.abs(amount) : Math.abs(amount),
        String(data.get("reason")),
        { uid: user.id, name: user.name },
      );
      form.reset();
      onMessage(direction === "OUT" ? "Salida registrada." : "Entrada registrada.");
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo registrar el movimiento"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await updateSupply(editing.id, {
        name: String(data.get("name")).trim(),
        unit: String(data.get("unit")),
        cost: Number(data.get("cost") ?? 0) || 0,
        minStock: Number(data.get("minStock") ?? 0) || 0,
        // La existencia no se edita aquí: se mueve con entradas y salidas para
        // que siempre quede el motivo registrado.
        stock: editing.stock,
        active: data.get("active") === "on",
      });
      setEditing(null);
      onMessage("Insumo actualizado.");
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo actualizar el insumo"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(supply: Supply) {
    if (
      !window.confirm(
        `¿Eliminar el insumo "${supply.name}"?\n\n` +
          "Sus entradas y salidas también se borran y dejan de aparecer en Reportes.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const removed = await deleteSupply(supply.id);
      setEditing(null);
      onMessage(
        removed > 0
          ? `"${supply.name}" eliminado junto con ${removed} ${removed === 1 ? "movimiento" : "movimientos"}.`
          : `"${supply.name}" eliminado.`,
      );
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo eliminar el insumo"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="metric-grid inventory-metrics">
        <article className="metric-card">
          <div className="metric-icon brown"><Icon name="coffee" size={22} /></div>
          <div>
            <span>Insumos</span>
            <strong>{supplies.length}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon green"><Icon name="sales" size={22} /></div>
          <div>
            <span>Valor en insumos</span>
            <strong>{money.format(totals.value)}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon amber"><Icon name="clock" size={22} /></div>
          <div>
            <span>Por acabarse</span>
            <strong>{totals.low.length}</strong>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon brown"><Icon name="orders" size={22} /></div>
          <div>
            <span>Movimientos</span>
            <strong>{movements.length}</strong>
          </div>
        </article>
      </div>

      {totals.low.length > 0 && (
        <div className="notice error">
          Por acabarse: {totals.low.map((item) => `${item.name} (${item.stock} ${item.unit})`).join(", ")}.
        </div>
      )}

      <div className="inventory-grid">
        <article className="reference-card">
          <div className="card-heading">
            <h2>Insumos</h2>
            <span>{supplies.length} en almacén</span>
          </div>
          <div className="report-table">
            <div className="report-head supply-head">
              <span>Insumo</span>
              <span>Existencia</span>
              <span>Costo</span>
              <span>Valor</span>
              <span />
            </div>
            {supplies.map((supply) => (
              <div className="report-row supply-head" key={supply.id}>
                <span>
                  {supply.name}
                  {!supply.active && <small className="supply-off"> · inactivo</small>}
                </span>
                <strong
                  className={
                    supply.minStock > 0 && supply.stock <= supply.minStock ? "stock-zero" : ""
                  }
                >
                  {supply.stock} {supply.unit}
                </strong>
                <span>{supply.cost ? money.format(supply.cost) : "—"}</span>
                <span>{money.format(supply.stock * supply.cost)}</span>
                {canManage ? (
                  <button className="product-edit" onClick={() => setEditing(supply)}>
                    Editar
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {!supplies.length && (
              <p className="reference-empty">
                Aún no hay insumos. Agrega leche, vasos o lo que uses en barra.
              </p>
            )}
          </div>
        </article>

        <div className="supply-forms">
          {canManage && (
            <form className="reference-card compact-form" onSubmit={create}>
              <h2>Nuevo insumo</h2>
              <p>Leche, vasos, jarabes… lo que se consume en barra.</p>
              <input name="name" placeholder="Nombre del insumo" required minLength={2} maxLength={80} />
              <div className="supply-inline">
                <select name="unit" defaultValue="pz" required>
                  {UNITS.map((unit) => (
                    <option value={unit} key={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <input name="cost" type="number" min="0" step="0.01" placeholder="Costo por unidad" />
              </div>
              <input
                name="minStock"
                type="number"
                min="0"
                step="0.01"
                placeholder="Avisar cuando baje de… (opcional)"
              />
              <button className="reference-primary" disabled={busy}>
                + Agregar insumo
              </button>
            </form>
          )}

          <form className="reference-card compact-form" onSubmit={move}>
            <h2>Entrada o salida</h2>
            <p>Mueve existencias y deja el motivo registrado.</p>
            <select name="supplyId" required defaultValue="">
              <option value="" disabled>
                Selecciona insumo…
              </option>
              {supplies.map((supply) => (
                <option value={supply.id} key={supply.id}>
                  {supply.name} · {supply.stock} {supply.unit}
                </option>
              ))}
            </select>
            <div className="supply-inline">
              <select name="direction" defaultValue="IN" required>
                <option value="IN">Entrada (+)</option>
                <option value="OUT">Salida (−)</option>
              </select>
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Cantidad"
                required
              />
            </div>
            <input name="reason" placeholder="Motivo (compra, consumo, merma…)" required minLength={4} />
            <button className="reference-primary" disabled={busy || !supplies.length}>
              Registrar movimiento
            </button>
          </form>
        </div>
      </div>

      <article className="reference-card">
        <div className="card-heading">
          <h2>Movimientos de insumos</h2>
          <span>{movements.length} esta semana</span>
        </div>
        <div className="report-table">
          <div className="report-head">
            <span>Insumo</span>
            <span>Tipo</span>
            <span>Cant.</span>
            <span>Motivo</span>
            <span>Quién</span>
          </div>
          {movements.map((movement) => (
            <div className="report-row" key={movement.id}>
              <span>{movement.supplyName}</span>
              <span>{movement.quantityChange > 0 ? "Entrada" : "Salida"}</span>
              <span className={movement.quantityChange > 0 ? "stock-in" : "stock-out"}>
                {movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange}{" "}
                {movement.unit}
              </span>
              <span>{movement.reason}</span>
              <span>{movement.userName}</span>
            </div>
          ))}
          {!movements.length && (
            <p className="reference-empty">Sin movimientos de insumos esta semana.</p>
          )}
        </div>
      </article>

      {editing && (
        <div className="editor-backdrop" onClick={() => setEditing(null)}>
          <form
            className="editor-card compact-form"
            onSubmit={saveEdit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="editor-head">
              <h2>Editar insumo</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <label>Nombre</label>
            <input name="name" defaultValue={editing.name} required minLength={2} maxLength={80} />

            <div className="price-cost-fields">
              <div>
                <label>Unidad</label>
                <select name="unit" defaultValue={editing.unit} required>
                  {UNITS.map((unit) => (
                    <option value={unit} key={unit}>
                      {unit}
                    </option>
                  ))}
                  {!UNITS.includes(editing.unit) && (
                    <option value={editing.unit}>{editing.unit}</option>
                  )}
                </select>
              </div>
              <div>
                <label>Costo por unidad</label>
                <input
                  name="cost"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing.cost || ""}
                  placeholder="0.00"
                />
              </div>
            </div>

            <label>Avisar cuando baje de</label>
            <input
              name="minStock"
              type="number"
              min="0"
              step="0.01"
              defaultValue={editing.minStock || ""}
              placeholder="0"
            />

            <label className="editor-check">
              <input type="checkbox" name="active" defaultChecked={editing.active} />
              <span>Activo</span>
            </label>

            <small className="editor-note">
              Existencia actual: {editing.stock} {editing.unit}. No se edita aquí — se mueve con
              entradas y salidas para que siempre quede el motivo.
            </small>

            <div className="editor-actions">
              <button type="button" onClick={() => setEditing(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="reference-primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>

            <div className="editor-danger">
              <button type="button" disabled={busy} onClick={() => void remove(editing)}>
                Eliminar insumo
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
