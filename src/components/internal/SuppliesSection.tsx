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
import { effectiveRecipe, unitCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import { moveSupply } from "../../api/transactions";
import type { Category, Product, Supply, SupplyMovement, User } from "../../types";
import { Icon } from "../Icon";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
/** Cantidades: con separador de miles y sin decimales de más. */
const num = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
/** Costo por bebida: a pesos redondos, que es como se piensa al poner precios. */
const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
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

/** Cuánto pesa un litro. Calibrado a la leche, que es el líquido de la barra. */
const GRAMS_PER_LITRE = 1030;

/**
 * Equivalencia de cada unidad con una base común, para que el paquete se
 * capture como se compra y la receta como se mide: "paquetes de 1 L" y "cada
 * bebida lleva 250 g" acaban siendo el mismo insumo.
 *
 * El puente entre volumen y peso está fijado al peso de la leche. No es
 * universal —un litro de jarabe pesa más, uno de aceite menos—, pero
 * preguntarle la densidad a quien está dando de alta un insumo cuesta más de
 * lo que valen esos puntos porcentuales. La pantalla siempre enseña la cuenta
 * con la que está trabajando, y quien necesite otro número captura el paquete
 * directamente en la unidad que mide, sin conversión de por medio.
 */
const CONVERSIONS: Record<string, { base: string; factor: number }> = {
  ml: { base: "medida", factor: GRAMS_PER_LITRE / 1000 },
  L: { base: "medida", factor: GRAMS_PER_LITRE },
  g: { base: "medida", factor: 1 },
  kg: { base: "medida", factor: 1000 },
  oz: { base: "medida", factor: 28.3495 },
  pz: { base: "pz", factor: 1 },
};

const VOLUME_UNITS = ["ml", "L"];

/** true cuando el paquete se compra por volumen y la receta se mide por peso, o al revés. */
function crossesVolumeAndWeight(from: string, to: string): boolean {
  const a = VOLUME_UNITS.includes(from);
  const b = VOLUME_UNITS.includes(to);
  return CONVERSIONS[from]?.base === CONVERSIONS[to]?.base && a !== b;
}

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
  // Un insumo suele cruzar categorías (la leche va en matcha, café y chai), así
  // que se marcan todas a la vez: `linkCats` son las que lo llevan completas y
  // `linkIds` las bebidas sueltas de las demás.
  const [linkCats, setLinkCats] = useState<string[]>([]);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [linkQty, setLinkQty] = useState("");
  const [linkUnit, setLinkUnit] = useState("ml");

  // "Volví a comprar" / "Corregir el conteo". Se separan porque son dos cosas
  // que se piensan distinto: una se cuenta en paquetes que llegaron, la otra
  // se cuenta mirando lo que hay. Restar a mano no se le pide a nadie.
  const [moveMode, setMoveMode] = useState<"BUY" | "COUNT">("BUY");
  const [moveSupplyId, setMoveSupplyId] = useState("");
  const [moveQty, setMoveQty] = useState("");

  const moveTarget = supplies.find((supply) => supply.id === moveSupplyId) ?? null;
  const moveDelta = !moveTarget
    ? 0
    : moveMode === "BUY"
      ? (Number(moveQty) || 0) * moveTarget.packSize
      : (Number(moveQty) || 0) - moveTarget.stock;

  // Campos controlados del alta: hacen falta para ir mostrando la unidad y el
  // costo por unidad mientras se escribe, en vez de hasta después de guardar.
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newPackPieces, setNewPackPieces] = useState("1");
  const [newPackSize, setNewPackSize] = useState("");
  const [newPackUnit, setNewPackUnit] = useState("L");
  const [newPackCost, setNewPackCost] = useState("");
  const [newPackLabel, setNewPackLabel] = useState("paquete");
  const [initialPacks, setInitialPacks] = useState("");

  // Un paquete puede traer varias piezas ("1 paquete de 12 piezas de 1 L"), así
  // que primero se saca cuánto trae en total en la unidad en que se compra.
  const packTotalBought = (Number(newPackPieces) || 0) * (Number(newPackSize) || 0);

  const packSizeInUnits = convert(packTotalBought, newPackUnit, newUnit);
  const newUnitCost = packSizeInUnits > 0 ? (Number(newPackCost) || 0) / packSizeInUnits : 0;

  // Lo mismo para la porción de la receta: se escribe como se dice ("30 ml",
  // "15 g") y se guarda en la unidad del insumo.
  const linkQtyInUnits = convert(Number(linkQty) || 0, linkUnit, newUnit);

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

  /** Bebidas activas agrupadas por categoría, para marcarlas todas de un tirón. */
  const productsByCategory = categories
    .map((category) => ({
      category,
      items: products.filter((product) => product.category === category.id && product.active),
    }))
    .filter((group) => group.items.length > 0);

  /** Una bebida cuenta como marcada si lo está ella o toda su categoría. */
  function isLinked(product: Product) {
    return linkCats.includes(product.category) || linkIds.includes(product.id);
  }

  const linkedCount = products.filter((product) => product.active && isLinked(product)).length;

  function resetForm() {
    setNewName("");
    setLinkCats([]);
    setLinkIds([]);
    setLinkQty("");
    setNewUnit("g");
    setNewPackPieces("1");
    setNewPackSize("");
    setNewPackUnit("L");
    setNewPackCost("");
    setNewPackLabel("paquete");
    setInitialPacks("");
  }

  function toggleCategory(id: string, checked: boolean) {
    setLinkCats((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
    // Al marcar la categoría completa sobran las marcas sueltas de sus bebidas.
    if (checked) {
      setLinkIds((current) =>
        current.filter((productId) => products.find((p) => p.id === productId)?.category !== id),
      );
    }
  }

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

  /**
   * Lo que cada insumo todavía da de sí: cuántas bebidas más salen con lo que
   * queda y cuánto cuesta cada una.
   *
   * La porción sale de las recetas que de verdad lo usan. Si varias bebidas
   * llevan cantidades distintas se promedia, porque no hay forma de saber cuál
   * se venderá primero — por eso el número se muestra como aproximado.
   */
  const yields = useMemo(() => {
    const portions = new Map<string, number[]>();
    for (const product of products) {
      if (!product.active) continue;
      for (const ingredient of effectiveRecipe(product, categories)) {
        const list = portions.get(ingredient.supplyId) ?? [];
        list.push(ingredient.quantity);
        portions.set(ingredient.supplyId, list);
      }
    }

    return new Map(
      supplies.map((supply) => {
        const list = portions.get(supply.id) ?? [];
        const portion = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
        return [
          supply.id,
          {
            portion,
            drinks: portion > 0 ? Math.floor(supply.stock / portion) : null,
            costPerDrink: portion * unitCost(supply),
            packs: supply.packSize > 0 ? supply.stock / supply.packSize : null,
            usedBy: list.length,
          },
        ];
      }),
    );
  }, [supplies, products, categories]);

  const totals = useMemo(() => {
    const empty = supplies.filter((item) => item.active && item.stock <= 0);
    const low = supplies.filter(
      (item) =>
        item.active &&
        item.stock > 0 &&
        // Se avisa por lo que se agote primero: el mínimo que se fijó a mano, o
        // que ya no alcance ni para diez bebidas más.
        ((item.minStock > 0 && item.stock <= item.minStock) ||
          (yields.get(item.id)?.drinks ?? Infinity) <= 10),
    );
    return {
      value: supplies.reduce((sum, item) => sum + item.stock * unitCost(item), 0),
      empty,
      low,
    };
  }, [supplies, yields]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const name = newName.trim();
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
      const quantity = linkQtyInUnits;
      let linkNote = "";
      if (quantity > 0 && (linkCats.length || linkIds.length)) {
        const ingredient = { supplyId, supplyName: name, unit, quantity };
        const parts: string[] = [];

        for (const categoryId of linkCats) {
          await addIngredientToCategory(categoryId, ingredient, categories);
        }
        if (linkCats.length) {
          const names = linkCats
            .map((id) => categories.find((item) => item.id === id)?.name ?? id)
            .join(", ");
          parts.push(`toda la categoría ${names}`);
        }

        // Una bebida marcada suelta dentro de una categoría ya marcada completa
        // ya lo hereda: escribírselo aparte sería duplicar el ingrediente.
        const individual = linkIds.filter((id) => {
          const product = products.find((item) => item.id === id);
          return product && !linkCats.includes(product.category);
        });
        if (individual.length) {
          await addIngredientToProducts(individual, ingredient, products, categories);
          parts.push(`${individual.length} ${individual.length === 1 ? "bebida" : "bebidas"} sueltas`);
        }

        if (parts.length) linkNote = ` Se agregó a ${parts.join(" y ")}.`;
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
    if (!moveTarget) return onError("Elige un insumo.");
    if (!moveDelta) {
      return onError(
        moveMode === "BUY"
          ? "Escribe cuántos paquetes llegaron."
          : "Ese es el número que ya tenía registrado, no hay nada que corregir.",
      );
    }

    setBusy(true);
    try {
      await moveSupply(
        moveTarget.id,
        moveDelta,
        moveMode === "BUY" ? "Compra de mercancía" : "Corrección de conteo",
        { uid: user.id, name: user.name },
        moveMode === "BUY" ? "PURCHASE" : "ADJUSTMENT",
      );
      setMoveQty("");
      onMessage(
        moveMode === "BUY"
          ? `Entraron ${moveDelta} ${moveTarget.unit} de ${moveTarget.name}.`
          : `${moveTarget.name} quedó en ${moveQty} ${moveTarget.unit}.`,
      );
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo guardar"));
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
            <span>Se acaban</span>
            <strong>{totals.empty.length + totals.low.length}</strong>
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

      {totals.empty.length > 0 && (
        <div className="notice error">
          <strong>Se acabó:</strong>{" "}
          {totals.empty.map((item) => item.name).join(", ")}. Compra y regístralo en "Actualizar
          existencia" para que las cuentas vuelvan a cuadrar.
        </div>
      )}

      {totals.low.length > 0 && (
        <div className="notice error">
          <strong>Está por acabarse:</strong>{" "}
          {totals.low
            .map((item) => {
              const drinks = yields.get(item.id)?.drinks;
              return drinks !== null && drinks !== undefined
                ? `${item.name} (para ${drinks} bebidas más)`
                : `${item.name} (${num.format(item.stock)} ${item.unit})`;
            })
            .join(", ")}
          .
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
              <span>Te queda</span>
              <span>Alcanza para</span>
              <span>Por bebida</span>
              <span />
            </div>
            {supplies.map((supply) => {
              const info = yields.get(supply.id);
              const scarce = supply.stock <= 0 || (info?.drinks ?? Infinity) <= 10;
              return (
              <div className="report-row supply-head" key={supply.id}>
                <span>
                  {supply.name}
                  {supply.packSize > 0 && (
                    <small className="supply-pack-note">
                      {" "}· {supply.packLabel} de {num.format(supply.packSize)} {supply.unit} a{" "}
                      {money.format(supply.packCost)}
                    </small>
                  )}
                  {!supply.active && <small className="supply-off"> · inactivo</small>}
                </span>
                <strong className={scarce ? "stock-zero" : ""}>
                  {num.format(supply.stock)} {supply.unit}
                  {info?.packs != null && info.packs > 0 && (
                    <small className="supply-pack-note">
                      {" "}({num.format(info.packs)} {supply.packLabel}
                      {info.packs === 1 ? "" : "s"})
                    </small>
                  )}
                </strong>
                <span className={scarce ? "stock-zero" : ""}>
                  {info?.drinks != null ? `~${info.drinks} bebidas` : "sin receta"}
                </span>
                <span>
                  {info && info.costPerDrink > 0
                    ? `${pesos.format(info.costPerDrink)} · ${num.format(info.portion)} ${supply.unit}`
                    : "—"}
                </span>
                {canManage ? (
                  <button className="product-edit" onClick={() => setEditing(supply)}>
                    Editar
                  </button>
                ) : (
                  <span />
                )}
              </div>
              );
            })}
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
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Nombre del insumo"
                required
                minLength={2}
                maxLength={80}
              />

              <label>En la receta se mide en</label>
              <select
                value={newUnit}
                onChange={(event) => {
                  const next = event.target.value;
                  setNewUnit(next);
                  // Piezas no se convierten a nada: si se cambia entre contar
                  // piezas y medir, la porción vuelve a la unidad del insumo.
                  if (!packUnitsFor(next).some((option) => option.value === linkUnit)) {
                    setLinkUnit(next);
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
              <div className="buy-row">
                <span>Le llamas</span>
                <select value={newPackLabel} onChange={(event) => setNewPackLabel(event.target.value)}>
                  {PACK_LABELS.map((label) => (
                    <option value={label} key={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="buy-row">
                <span>Cada {newPackLabel} trae</span>
                <div className="buy-field">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={newPackPieces}
                    onChange={(event) => setNewPackPieces(event.target.value)}
                    required
                  />
                  <em>piezas</em>
                </div>
              </div>
              <div className="buy-row">
                <span>Cada pieza tiene</span>
                <div className="buy-field">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPackSize}
                    onChange={(event) => setNewPackSize(event.target.value)}
                    required
                  />
                  <select value={newPackUnit} onChange={(event) => setNewPackUnit(event.target.value)}>
                    {UNITS.map((unit) => (
                      <option value={unit.value} key={unit.value}>
                        {unit.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="buy-row">
                <span>El {newPackLabel} cuesta</span>
                <div className="buy-field">
                  <em>$</em>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPackCost}
                    onChange={(event) => setNewPackCost(event.target.value)}
                    required
                  />
                </div>
              </div>

              {newUnitCost > 0 ? (
                <div className="notice success">
                  {newPackPieces} piezas × {newPackSize} {newPackUnit} ={" "}
                  <strong>
                    {num.format(packTotalBought)} {newPackUnit}
                  </strong>
                  {crossesVolumeAndWeight(newPackUnit, newUnit) && (
                    <>
                      {" "}={" "}
                      <strong>
                        {num.format(packSizeInUnits)} {newUnit}
                      </strong>{" "}
                      (1 L pesa {GRAMS_PER_LITRE} g)
                    </>
                  )}
                  , por {money.format(Number(newPackCost))}.
                  <br />
                  Abajo, al marcar las bebidas, te digo cuánto cuesta cada una.
                </div>
              ) : null}
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
              <small className="editor-note">
                Marca en todas las categorías que quieras: un mismo insumo suele cruzarlas (la leche
                va en matcha, café y chai). Puedes dejarlo para después y armarlo desde Menú.
              </small>

              <div className="link-products">
                {productsByCategory.map(({ category, items }) => {
                  const whole = linkCats.includes(category.id);
                  return (
                    <div className="link-group" key={category.id}>
                      <label className="link-product link-group-head">
                        <input
                          type="checkbox"
                          checked={whole}
                          onChange={(event) => toggleCategory(category.id, event.target.checked)}
                        />
                        <span>
                          <strong>
                            {category.emoji} {category.name}
                          </strong>{" "}
                          — toda la categoría ({items.length})
                        </span>
                      </label>
                      {items.map((product) => (
                        <label className="link-product link-child" key={product.id}>
                          <input
                            type="checkbox"
                            checked={isLinked(product)}
                            // Con la categoría completa marcada, sus bebidas ya
                            // lo llevan: desmarcarlas una por una no aplicaría.
                            disabled={whole}
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
                    </div>
                  );
                })}
                {!productsByCategory.length && (
                  <p className="reference-empty">Todavía no hay bebidas activas en el menú.</p>
                )}
              </div>

              {linkedCount > 0 && (
                <>
                  <p className="link-count">
                    {linkedCount} {linkedCount === 1 ? "bebida seleccionada" : "bebidas seleccionadas"}
                  </p>

                  <label>¿Cuánto lleva cada bebida?</label>
                  <div className="supply-portion">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={linkQty}
                      onChange={(event) => setLinkQty(event.target.value)}
                      placeholder="30"
                    />
                    <select value={linkUnit} onChange={(event) => setLinkUnit(event.target.value)}>
                      {packUnitsFor(newUnit).map((unit) => (
                        <option value={unit.value} key={unit.value}>
                          {unit.value}
                        </option>
                      ))}
                    </select>
                    <span className="supply-suffix">
                      {linkUnit !== newUnit && linkQtyInUnits > 0 && (
                        <>= {num.format(linkQtyInUnits)} {newUnit}</>
                      )}
                    </span>
                  </div>

                  {linkQtyInUnits > 0 && newUnitCost > 0 && (
                    <div className="notice success">
                      Cada bebida te cuesta{" "}
                      <strong>{pesos.format(linkQtyInUnits * newUnitCost)}</strong> de{" "}
                      {newName.trim() || "este insumo"} ({money.format(linkQtyInUnits * newUnitCost)}).
                      <br />
                      Un {newPackLabel} te alcanza para{" "}
                      <strong>{Math.floor(packSizeInUnits / linkQtyInUnits)} bebidas</strong>.
                    </div>
                  )}
                  <small className="editor-note">
                    Esa cantidad se usa para todas las marcadas. Si alguna lleva una medida
                    distinta, la ajustas después desde Menú → Receta de ese producto.
                  </small>
                </>
              )}

              <button className="reference-primary" disabled={busy}>
                + Agregar insumo
              </button>
            </form>
          )}

          <form className="reference-card compact-form" onSubmit={move}>
            <h2>Actualizar existencia</h2>
            <p>
              Sólo para cuando vuelves a comprar o cuando el conteo no cuadra. Las ventas se
              descuentan solas y la merma se anota al cerrar el turno.
            </p>

            <div className="inventory-tabs move-tabs">
              <button
                type="button"
                className={moveMode === "BUY" ? "active" : ""}
                onClick={() => {
                  setMoveMode("BUY");
                  setMoveQty("");
                }}
              >
                Volví a comprar
              </button>
              <button
                type="button"
                className={moveMode === "COUNT" ? "active" : ""}
                onClick={() => {
                  setMoveMode("COUNT");
                  setMoveQty("");
                }}
              >
                Corregir el conteo
              </button>
            </div>

            <select
              value={moveSupplyId}
              onChange={(event) => {
                setMoveSupplyId(event.target.value);
                setMoveQty("");
              }}
              required
            >
              <option value="" disabled>
                ¿De qué insumo?
              </option>
              {supplies.map((supply) => (
                <option value={supply.id} key={supply.id}>
                  {supply.name} · hay {supply.stock} {supply.unit}
                </option>
              ))}
            </select>

            <label>
              {moveMode === "BUY"
                ? `¿Cuántos ${moveTarget?.packLabel ?? "paquete"}s llegaron?`
                : "¿Cuánto hay realmente?"}
            </label>
            <div className="supply-inline">
              <input
                type="number"
                min="0"
                step="0.01"
                value={moveQty}
                onChange={(event) => setMoveQty(event.target.value)}
                placeholder={moveMode === "BUY" ? "5" : String(moveTarget?.stock ?? 0)}
                required
              />
              <span className="supply-suffix">
                {moveMode === "BUY"
                  ? moveTarget
                    ? `${moveTarget.packLabel}s de ${moveTarget.packSize} ${moveTarget.unit}`
                    : ""
                  : (moveTarget?.unit ?? "")}
              </span>
            </div>

            {moveTarget && moveQty !== "" && (
              <div className={`notice ${moveDelta === 0 ? "" : "success"}`}>
                {moveMode === "BUY" ? (
                  <>
                    Entran <strong>{moveDelta} {moveTarget.unit}</strong> y quedas con{" "}
                    <strong>{Math.round((moveTarget.stock + moveDelta) * 100) / 100} {moveTarget.unit}</strong>.
                  </>
                ) : moveDelta === 0 ? (
                  <>Es el mismo número que ya estaba registrado.</>
                ) : (
                  <>
                    El sistema decía {moveTarget.stock} {moveTarget.unit}, así que se{" "}
                    {moveDelta > 0 ? "suman" : "restan"}{" "}
                    <strong>{Math.abs(moveDelta)} {moveTarget.unit}</strong>.
                  </>
                )}
              </div>
            )}

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
              aquí cuando suba y todas las recetas que lo usan se recostean solas: ahorita un{" "}
              {editing.packLabel} rinde <strong>{num.format(editing.packSize)} {editing.unit}</strong>.
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
