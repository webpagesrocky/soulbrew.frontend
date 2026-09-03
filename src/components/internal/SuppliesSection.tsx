import { useEffect, useMemo, useState } from "react";
import {
  addIngredientToCategory,
  addIngredientToProducts,
  createSupply,
  deleteSupply,
  subscribeCategories,
  subscribeProducts,
  subscribeSupplies,
  subscribeSupplyMovements,
  updateSupply,
} from "../../api/collections";
import { unitCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import { moveSupply } from "../../api/transactions";
import type { Category, Product, Supply, SupplyMovement, User } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
/** Costo por unidad de uso: son centavos partidos, necesita más decimales. */
const unitMoney = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 4,
});

/**
 * Unidades en las que se *usa* el insumo, que es como se lleva la existencia y
 * como se escriben las cantidades de la receta. Son las que tienen sentido
 * medir en barra: líquidos, sólidos y piezas contables.
 */
const UNITS = [
  { value: "ml", label: "ml (mililitros)" },
  { value: "L", label: "L (litros)" },
  { value: "g", label: "g (gramos)" },
  { value: "kg", label: "kg (kilos)" },
  { value: "oz", label: "oz (onzas)" },
  { value: "pz", label: "pz (piezas)" },
];

const PACK_LABELS = ["paquete", "caja", "bolsa", "galón", "bote", "pieza"];

/**
 * Equivalencia de cada unidad con la base de su familia (ml, g, pz).
 *
 * Sirve para que el paquete se capture como se compra y el consumo como se
 * usa: "viene en paquetes de 1 L" y "cada bebida lleva 30 ml" son la misma
 * leche, y nadie debería tener que escribir 1000 para decir un litro.
 */
const CONVERSIONS: Record<string, { base: string; factor: number }> = {
  ml: { base: "ml", factor: 1 },
  L: { base: "ml", factor: 1000 },
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  oz: { base: "g", factor: 28.3495 },
  pz: { base: "pz", factor: 1 },
};

/** Unidades en las que se puede vender un insumo que se usa en `unit`. */
function packUnitsFor(unit: string) {
  const base = CONVERSIONS[unit]?.base;
  return UNITS.filter((option) => CONVERSIONS[option.value]?.base === base);
}

/** Convierte una cantidad de `from` a `to` dentro de la misma familia. */
function convert(amount: number, from: string, to: string): number {
  const a = CONVERSIONS[from];
  const b = CONVERSIONS[to];
  if (!a || !b || a.base !== b.base) return amount;
  return (amount * a.factor) / b.factor;
}

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

  // Alta de insumo: a qué productos se le mete de una vez.
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [linkCategory, setLinkCategory] = useState("");
  const [linkAll, setLinkAll] = useState(false);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [linkQty, setLinkQty] = useState("");

  // Campos controlados del alta: hacen falta para ir mostrando la unidad y el
  // costo por unidad mientras se escribe, en vez de hasta después de guardar.
  const [newUnit, setNewUnit] = useState("ml");
  const [newPackSize, setNewPackSize] = useState("");
  const [newPackUnit, setNewPackUnit] = useState("L");
  const [newPackCost, setNewPackCost] = useState("");
  const [newPackLabel, setNewPackLabel] = useState("paquete");
  const [initialPacks, setInitialPacks] = useState("");

  // El paquete se captura en la unidad en que se compra ("1 L") y se guarda en
  // la unidad en que se usa ("1000 ml"), que es en la que vive la existencia.
  const packSizeInUnits = convert(Number(newPackSize) || 0, newPackUnit, newUnit);
  const newUnitCost = packSizeInUnits > 0 ? (Number(newPackCost) || 0) / packSizeInUnits : 0;

  const canManage = user.role === "ADMIN" || user.role === "SUPERVISOR";

  useEffect(
    () =>
      subscribeProducts(setProducts, (reason) =>
        onError(errorMessage(reason, "No se pudo cargar el catálogo")),
      ),
    [onError],
  );

  useEffect(
    () =>
      subscribeCategories(
        (list) => setCategories(list.filter((item) => item.active)),
        (reason) => onError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [onError],
  );

  const linkableProducts = products.filter(
    (product) => product.category === linkCategory && product.active,
  );

  function resetForm() {
    setLinkCategory("");
    setLinkAll(false);
    setLinkIds([]);
    setLinkQty("");
    setNewUnit("ml");
    setNewPackSize("");
    setNewPackUnit("L");
    setNewPackCost("");
    setNewPackLabel("paquete");
    setInitialPacks("");
  }

  const allLinked =
    linkableProducts.length > 0 && linkIds.length === linkableProducts.length;

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
      value: supplies.reduce((sum, item) => sum + item.stock * unitCost(item), 0),
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
      const name = String(data.get("name")).trim();
      const unit = newUnit;
      const packSize = packSizeInUnits;
      const supplyId = await createSupply({
        name,
        unit,
        minStock: Number(data.get("minStock") ?? 0) || 0,
        packLabel: newPackLabel,
        packSize,
        packCost: Number(newPackCost) || 0,
      });

      // Existencia inicial en la misma pantalla: nace en cero y aquí mismo se
      // le registra lo que ya hay, para no obligar a un segundo paso aparte.
      const packs = Number(initialPacks) || 0;
      let stockNote = "";
      if (packs > 0 && packSize > 0) {
        await moveSupply(supplyId, packs * packSize, "Existencia inicial", { uid: user.id, name: user.name }, "PURCHASE");
        stockNote = ` Entraron ${packs * packSize} ${unit}.`;
      }

      // Segundo paso opcional: meterlo de una vez en las recetas que lo usan.
      const quantity = Number(linkQty);
      let linkNote = "";
      if (linkCategory && quantity > 0) {
        const ingredient = { supplyId, supplyName: name, unit, quantity };
        if (linkAll) {
          await addIngredientToCategory(linkCategory, ingredient, categories);
          const category = categories.find((item) => item.id === linkCategory);
          linkNote = ` Se agregó a la receta de ${category?.name ?? linkCategory}, así que lo llevan todos sus productos.`;
        } else if (linkIds.length) {
          await addIngredientToProducts(linkIds, ingredient, products, categories);
          linkNote = ` Se agregó a ${linkIds.length} ${linkIds.length === 1 ? "producto" : "productos"}.`;
        }
      }

      form.reset();
      resetForm();
      onMessage(`"${name}" agregado.${stockNote}${linkNote}`);
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
    const supplyId = String(data.get("supplyId"));
    const supply = supplies.find((item) => item.id === supplyId);
    const direction = String(data.get("direction"));
    let amount = Math.abs(Number(data.get("quantity")));

    // Se compra por paquete pero se lleva la existencia en unidades de uso:
    // "5 paquetes" de leche de 600 ml entran como 3000 ml.
    if (String(data.get("mode")) === "PACK" && supply && supply.packSize > 0) {
      amount = amount * supply.packSize;
    }

    setBusy(true);
    try {
      await moveSupply(
        supplyId,
        direction === "OUT" ? -amount : amount,
        String(data.get("reason")),
        { uid: user.id, name: user.name },
        // Una entrada es mercancía que llegó; la salida manual es corrección
        // de conteo (la merma tiene su propia captura al cerrar el turno).
        direction === "OUT" ? "ADJUSTMENT" : "PURCHASE",
      );
      form.reset();
      onMessage(
        direction === "OUT"
          ? `Se restaron ${amount} ${supply?.unit ?? ""} de ${supply?.name ?? "el insumo"}.`
          : `Entraron ${amount} ${supply?.unit ?? ""} de ${supply?.name ?? "el insumo"}.`,
      );
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
        minStock: Number(data.get("minStock") ?? 0) || 0,
        packLabel: String(data.get("packLabel") ?? "paquete"),
        packSize: Number(data.get("packSize") ?? 0) || 0,
        packCost: Number(data.get("packCost") ?? 0) || 0,
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
              <span>Costo unitario</span>
              <span>Valor</span>
              <span />
            </div>
            {supplies.map((supply) => (
              <div className="report-row supply-head" key={supply.id}>
                <span>
                  {supply.name}
                  {supply.packSize > 0 && (
                    <small className="supply-pack-note">
                      {" "}· {supply.packLabel} de {supply.packSize} {supply.unit} a{" "}
                      {money.format(supply.packCost)}
                    </small>
                  )}
                  {!supply.active && <small className="supply-off"> · inactivo</small>}
                </span>
                <strong
                  className={
                    supply.minStock > 0 && supply.stock <= supply.minStock ? "stock-zero" : ""
                  }
                >
                  {supply.stock} {supply.unit}
                </strong>
                <span>
                  {unitCost(supply) ? `${unitMoney.format(unitCost(supply))} / ${supply.unit}` : "—"}
                </span>
                <span>{money.format(supply.stock * unitCost(supply))}</span>
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

              <label>En la receta se mide en</label>
              <select
                value={newUnit}
                onChange={(event) => {
                  const next = event.target.value;
                  setNewUnit(next);
                  // Al cambiar de familia (de líquido a sólido), la unidad del
                  // paquete deja de tener sentido: se reinicia a la mayor.
                  const options = packUnitsFor(next);
                  if (!options.some((option) => option.value === newPackUnit)) {
                    setNewPackUnit(options[options.length - 1]?.value ?? next);
                  }
                }}
                required
              >
                {UNITS.map((unit) => (
                  <option value={unit.value} key={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>

              <label>Cómo lo compras</label>
              <div className="supply-buy">
                <select value={newPackLabel} onChange={(event) => setNewPackLabel(event.target.value)}>
                  {PACK_LABELS.map((label) => (
                    <option value={label} key={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPackSize}
                  onChange={(event) => setNewPackSize(event.target.value)}
                  placeholder="de…"
                  required
                />
                <select value={newPackUnit} onChange={(event) => setNewPackUnit(event.target.value)}>
                  {packUnitsFor(newUnit).map((unit) => (
                    <option value={unit.value} key={unit.value}>
                      {unit.value}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPackCost}
                  onChange={(event) => setNewPackCost(event.target.value)}
                  placeholder="cuesta $"
                  required
                />
              </div>

              {newUnitCost > 0 ? (
                <div className="notice success">
                  Un {newPackLabel} de {newPackSize} {newPackUnit} son{" "}
                  <strong>
                    {Math.round(packSizeInUnits * 100) / 100} {newUnit}
                  </strong>
                  , así que cada {newUnit} te sale en{" "}
                  <strong>{unitMoney.format(newUnitCost)}</strong>.
                </div>
              ) : (
                <small className="editor-note">
                  Ejemplo: leche que en la receta se mide en <strong>ml</strong>, y la compras en{" "}
                  <strong>paquetes de 1 L</strong> a <strong>$28</strong>. El sistema saca solo
                  cuánto vale cada ml.
                </small>
              )}
              <label>¿Cuánto tienes ahora?</label>
              <div className="supply-inline">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={initialPacks}
                  onChange={(event) => setInitialPacks(event.target.value)}
                  placeholder="0"
                />
                <span className="supply-suffix">
                  {newPackLabel}
                  {Number(initialPacks) === 1 ? "" : "s"}
                  {Number(initialPacks) > 0 && packSizeInUnits > 0 && (
                    <>
                      {" "}= {Math.round(Number(initialPacks) * packSizeInUnits * 100) / 100} {newUnit}
                    </>
                  )}
                </span>
              </div>

              <input
                name="minStock"
                type="number"
                min="0"
                step="0.01"
                placeholder={`Avisar cuando baje de… ${newUnit} (opcional)`}
              />

              <label>¿Qué bebidas lo llevan? — arma la receta</label>
              <select
                value={linkCategory}
                onChange={(event) => {
                  setLinkCategory(event.target.value);
                  setLinkIds([]);
                  setLinkAll(false);
                }}
              >
                <option value="">Elige una categoría…</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.emoji} {category.name}
                  </option>
                ))}
              </select>
              {!linkCategory && (
                <small className="editor-note">
                  Elige una categoría y te aparecen sus bebidas para marcar cuáles lo llevan y
                  cuánto lleva cada una. Puedes dejarlo para después y armarlo desde Menú.
                </small>
              )}

              {linkCategory && (
                <>
                  <label className="editor-check">
                    <input
                      type="checkbox"
                      checked={linkAll}
                      onChange={(event) => {
                        setLinkAll(event.target.checked);
                        if (event.target.checked) setLinkIds([]);
                      }}
                    />
                    <span>Lo lleva toda la categoría</span>
                  </label>

                  {!linkAll && (
                    <div className="link-products">
                      {linkableProducts.length > 1 && (
                        <label className="link-product link-all">
                          <input
                            type="checkbox"
                            checked={allLinked}
                            onChange={(event) =>
                              setLinkIds(
                                event.target.checked
                                  ? linkableProducts.map((product) => product.id)
                                  : [],
                              )
                            }
                          />
                          <span>
                            <strong>Seleccionar todos</strong> ({linkableProducts.length})
                          </span>
                        </label>
                      )}
                      {linkableProducts.map((product) => (
                        <label className="link-product" key={product.id}>
                          <input
                            type="checkbox"
                            checked={linkIds.includes(product.id)}
                            onChange={(event) =>
                              setLinkIds((current) =>
                                event.target.checked
                                  ? [...current, product.id]
                                  : current.filter((id) => id !== product.id),
                              )
                            }
                          />
                          <span>{product.name}</span>
                        </label>
                      ))}
                      {!linkableProducts.length && (
                        <p className="reference-empty">Esa categoría no tiene productos activos.</p>
                      )}
                    </div>
                  )}

                  <label>¿Cuánto lleva cada bebida?</label>
                  <div className="supply-inline">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={linkQty}
                      onChange={(event) => setLinkQty(event.target.value)}
                      placeholder="250"
                    />
                    <span className="supply-suffix">
                      {newUnit}
                      {Number(linkQty) > 0 && newUnitCost > 0 && (
                        <> · {unitMoney.format(Number(linkQty) * newUnitCost)} por bebida</>
                      )}
                    </span>
                  </div>
                  <small className="editor-note">
                    {linkAll
                      ? "Se agrega a la receta de la categoría, así que lo heredan todos sus productos."
                      : "Se agrega solo a los productos marcados. Al que aún no tenga receta propia se le copia primero la de su categoría, para que no pierda lo que ya heredaba."}
                  </small>
                </>
              )}

              <button className="reference-primary" disabled={busy}>
                + Agregar insumo
              </button>
            </form>
          )}

          <form className="reference-card compact-form" onSubmit={move}>
            <h2>Llegó mercancía</h2>
            <p>
              Úsalo cada vez que compres. Lo que se vende se descuenta solo, y lo que se derrama se
              anota al cerrar el turno — aquí no hay que registrar nada de eso.
            </p>
            <select name="supplyId" required defaultValue="">
              <option value="" disabled>
                ¿Qué compraste?
              </option>
              {supplies.map((supply) => (
                <option value={supply.id} key={supply.id}>
                  {supply.name} · te quedan {supply.stock} {supply.unit}
                </option>
              ))}
            </select>
            <div className="supply-inline">
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="¿Cuántos?"
                required
              />
              <select name="mode" defaultValue="PACK">
                <option value="PACK">paquetes completos</option>
                <option value="UNIT">sueltos (ml, g, pz)</option>
              </select>
            </div>
            <select name="direction" defaultValue="IN" required>
              <option value="IN">Los compré (súmalos)</option>
              <option value="OUT">Me sobran menos de los que dice (réstalos)</option>
            </select>
            <input
              name="reason"
              placeholder="Nota: compra de la semana, conteo del lunes…"
              required
              minLength={4}
            />
            <button className="reference-primary" disabled={busy || !supplies.length}>
              Guardar
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

            <label>Se usa y se mide en</label>
            <select name="unit" defaultValue={editing.unit} required>
              {UNITS.map((unit) => (
                <option value={unit.value} key={unit.value}>
                  {unit.label}
                </option>
              ))}
              {/* Si el insumo trae una unidad que ya no está en la lista, se
                  conserva para que guardar no se la cambie por accidente. */}
              {!UNITS.some((unit) => unit.value === editing.unit) && (
                <option value={editing.unit}>{editing.unit}</option>
              )}
            </select>

            <label>Cómo lo compras</label>
            <div className="supply-pack">
              <select name="packLabel" defaultValue={editing.packLabel || "paquete"}>
                {PACK_LABELS.map((label) => (
                  <option value={label} key={label}>
                    {label}
                  </option>
                ))}
                {editing.packLabel && !PACK_LABELS.includes(editing.packLabel) && (
                  <option value={editing.packLabel}>{editing.packLabel}</option>
                )}
              </select>
              <input
                name="packSize"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing.packSize || ""}
                placeholder={`de… ${editing.unit}`}
              />
              <input
                name="packCost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing.packCost || ""}
                placeholder="cuesta $"
              />
            </div>
            <small className="editor-note">
              El tamaño va en {editing.unit}, la unidad en que se mide la receta. Corrige el precio
              aquí cuando suba y todas las recetas que lo usan se recostean solas: ahorita cada{" "}
              {editing.unit} sale en <strong>{unitMoney.format(unitCost(editing))}</strong>.
            </small>

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
