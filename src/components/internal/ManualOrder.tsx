import { useEffect, useMemo, useState } from "react";
import {
  subscribeCategories,
  subscribeOptionGroups,
  subscribeOptionImages,
  subscribeProducts,
} from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { resolveOptionGroups } from "../../api/options";
import { createPublicOrder, MAX_ITEMS, payOrder } from "../../api/transactions";
import { ProductCustomizer } from "../ProductCustomizer";
import type {
  Category,
  ChosenOption,
  OptionGroup,
  OptionImage,
  PaymentMethod,
  Product,
  User,
} from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/**
 * Un renglón del ticket. El mismo producto puede ir dos veces con
 * personalizaciones distintas: un latte con cold foam de vainilla y otro sin
 * nada son dos cosas que se cobran distinto.
 */
interface Line {
  id: string;
  productId: string;
  options: ChosenOption[];
  quantity: number;
}

function lineKey(productId: string, options: ChosenOption[]) {
  return `${productId}|${options.map((option) => option.optionId).sort().join(",")}`;
}

/**
 * Tope de unidades por producto en un pedido. El stock real ya no limita la
 * venta (sólo el interruptor manual "agotado" lo hace); este número evita
 * pedidos absurdos, no representa inventario disponible.
 */
const MAX_QTY = 20;

interface Props {
  user: User;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Toma de pedidos en barra.
 *
 * Usa el mismo catálogo y las mismas categorías que el menú público, y crea la
 * orden por la misma vía, así que hereda sus validaciones: precios reales,
 * productos activos y folio consecutivo.
 */
export function ManualOrder({ user, onClose, onDone }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [images, setImages] = useState<OptionImage[]>([]);
  // Producto que se está personalizando. `line` viene lleno al editar un
  // renglón que ya está en el ticket, para no volver a elegir todo.
  const [customizing, setCustomizing] = useState<{ product: Product; line: Line | null } | null>(
    null,
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeProducts(
        (rows) => setProducts(rows.filter((product) => product.active)),
        (reason) => setError(errorMessage(reason, "No se pudo cargar el menú")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeCategories(
        (rows) => setCategories(rows.filter((item) => item.active)),
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeOptionGroups(
        (rows) => setGroups(rows.filter((group) => group.active)),
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las personalizaciones")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeOptionImages(setImages, (reason) =>
        setError(errorMessage(reason, "No se pudieron cargar las fotos")),
      ),
    [],
  );

  useEffect(() => {
    setCategory((current) => {
      if (current && categories.some((item) => item.id === current)) return current;
      return categories[0]?.id ?? null;
    });
  }, [categories]);

  const shown = products.filter((product) => product.category === category);
  const productOf = (id: string) => products.find((product) => product.id === id);

  /** Precio de una unidad: el del producto más lo que cobre cada opción. */
  function linePrice(line: Line) {
    const base = productOf(line.productId)?.price ?? 0;
    return line.options.reduce((sum, option) => sum + option.priceDelta, base);
  }

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, products],
  );

  /**
   * Tocar un producto abre su ventana de personalización, igual que en el menú
   * público. Antes el pedido de barra se armaba sólo con producto y cantidad:
   * el cold foam no se elegía y, sobre todo, no se cobraba.
   */
  function pick(product: Product) {
    setError("");
    if (!resolveOptionGroups(product, groups).length) return addLine(product.id, [], 1);
    setCustomizing({ product, line: null });
  }

  function addLine(productId: string, options: ChosenOption[], quantity: number) {
    const key = lineKey(productId, options);
    setCart((current) => {
      const existing = current.find((line) => lineKey(line.productId, line.options) === key);
      if (existing) {
        return current.map((line) =>
          line === existing
            ? { ...line, quantity: Math.min(MAX_QTY, line.quantity + quantity) }
            : line,
        );
      }
      if (current.length >= MAX_ITEMS) {
        setError(`Una orden admite hasta ${MAX_ITEMS} renglones distintos.`);
        return current;
      }
      return [...current, { id: `${key}-${Date.now()}`, productId, options, quantity }];
    });
  }

  function changeQuantity(lineId: string, delta: number) {
    setError("");
    setCart((current) =>
      current
        .map((line) =>
          line.id === lineId
            ? { ...line, quantity: Math.max(0, Math.min(MAX_QTY, line.quantity + delta)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function submit(charge: PaymentMethod | null) {
    if (!cart.length) return setError("Agrega al menos un producto.");
    if (customerName.trim().length < 2) return setError("Escribe el nombre del cliente.");
    if (customerPhone && !/^\d{10}$/.test(customerPhone)) {
      return setError("El número de celular debe tener 10 dígitos.");
    }

    setBusy(true);
    setError("");
    try {
      const order = await createPublicOrder({
        customerName,
        customerPhone,
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          options: line.options,
        })),
      });

      const loyaltyNote = order.loyalty
        ? order.loyalty.rewardEligible
          ? " 🎉 Este pedido cumple 10 visitas: el café va gratis."
          : ` Cliente lleva ${order.loyalty.visits} de 10 visitas.`
        : "";

      if (!charge) {
        onDone(
          `Pedido ${order.code} creado por ${money.format(order.total)}. Queda pendiente de cobro.${loyaltyNote}`,
        );
        onClose();
        return;
      }

      // Cobrar es un segundo paso a propósito: si falla (por ejemplo, sin caja
      // abierta) el pedido ya quedó registrado y se puede cobrar desde la
      // lista, en vez de perderse lo capturado.
      await payOrder(order.id, charge, { uid: user.id, name: user.name });
      onDone(`Pedido ${order.code} cobrado: ${money.format(order.total)}.${loyaltyNote}`);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo crear el pedido"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div className="manual-order" onClick={(event) => event.stopPropagation()}>
        <div className="editor-head">
          <h2>Nuevo pedido</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="manual-order-body">
          <div className="manual-order-catalog">
            <div className="inventory-tabs manual-tabs">
              {categories.map((item) => (
                <button
                  key={item.id}
                  className={category === item.id ? "active" : ""}
                  onClick={() => setCategory(item.id)}
                >
                  {item.emoji} {item.name}
                </button>
              ))}
            </div>

            <div className="manual-products">
              {shown.map((product) => {
                const quantity = cart
                  .filter((line) => line.productId === product.id)
                  .reduce((sum, line) => sum + line.quantity, 0);
                const soldOut = product.soldOut;
                return (
                  <button
                    key={product.id}
                    className={`manual-product ${quantity ? "picked" : ""} ${soldOut ? "sold-out" : ""}`}
                    disabled={soldOut}
                    onClick={() => pick(product)}
                  >
                    <span className="manual-product-name">{product.name}</span>
                    <span className="manual-product-price">{money.format(product.price)}</span>
                    {soldOut && <span className="manual-product-stock">Agotado</span>}
                    {quantity > 0 && <span className="manual-product-badge">{quantity}</span>}
                  </button>
                );
              })}
              {!shown.length && (
                <p className="reference-empty">No hay productos activos en esta categoría.</p>
              )}
            </div>
          </div>

          <div className="manual-order-ticket">
            <h3>Ticket</h3>
            <div className="manual-lines">
              {cart.map((line) => {
                const product = productOf(line.productId);
                if (!product) return null;
                return (
                  <div className="manual-line" key={line.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <small>{money.format(linePrice(line))} c/u</small>
                      {/* Lo elegido se ve en el ticket: es lo que la barra
                          tiene que preparar y lo que explica el precio. */}
                      {line.options.length > 0 && (
                        <ul className="manual-line-options">
                          {line.options.map((option) => (
                            <li key={option.optionId}>
                              {option.optionName}
                              {option.priceDelta > 0 && ` (+${money.format(option.priceDelta)})`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {resolveOptionGroups(product, groups).length > 0 && (
                        <button
                          type="button"
                          className="manual-line-edit"
                          onClick={() => setCustomizing({ product, line })}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <div className="sb-qty manual-qty">
                      <button onClick={() => changeQuantity(line.id, -1)}>−</button>
                      <span>{line.quantity}</span>
                      <button
                        onClick={() => changeQuantity(line.id, 1)}
                        disabled={line.quantity >= MAX_QTY}
                      >
                        +
                      </button>
                    </div>
                    <strong>{money.format(linePrice(line) * line.quantity)}</strong>
                  </div>
                );
              })}
              {!cart.length && <p className="reference-empty">Toca un producto para agregarlo.</p>}
            </div>

            <div className="manual-total">
              <span>Total</span>
              <strong>{money.format(total)}</strong>
            </div>

            <label>¿A nombre de quién?</label>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nombre del cliente"
              minLength={2}
            />
            <label>Celular (opcional, para su tarjeta de puntos)</label>
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              pattern="[0-9]{10}"
              placeholder="10 dígitos"
              maxLength={10}
            />

            <p className="manual-hint">Cobrar requiere tener una caja abierta.</p>
            <div className="manual-pay">
              <button disabled={busy} onClick={() => void submit("CASH")}>Efectivo</button>
              <button disabled={busy} onClick={() => void submit("CARD")}>Tarjeta</button>
              <button disabled={busy} onClick={() => void submit("TRANSFER")}>Transfer.</button>
            </div>
            <button
              className="reference-primary manual-pending"
              disabled={busy}
              onClick={() => void submit(null)}
            >
              {busy ? "Guardando…" : "Guardar sin cobrar"}
            </button>
          </div>
        </div>
      </div>

      {customizing && (
        <ProductCustomizer
          product={customizing.product}
          groups={groups}
          images={images}
          initial={customizing.line?.options ?? []}
          initialQuantity={customizing.line?.quantity ?? 1}
          onClose={() => setCustomizing(null)}
          onConfirm={(options, quantity) => {
            // Al editar se quita el renglón viejo y se vuelve a agregar: si la
            // nueva combinación ya existe en el ticket, se juntan solas.
            if (customizing.line) {
              setCart((current) => current.filter((line) => line.id !== customizing.line!.id));
            }
            addLine(customizing.product.id, options, quantity);
            setCustomizing(null);
          }}
        />
      )}
    </div>
  );
}
