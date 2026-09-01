import { useEffect, useMemo, useState } from "react";
import { subscribeCategories, subscribeProducts } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { createPublicOrder, payOrder } from "../../api/transactions";
import type { Category, PaymentMethod, Product, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/**
 * Tope de renglones distintos por orden. Lo imponen las reglas de Firestore,
 * que validan precio por precio sin poder usar bucles, así que la interfaz
 * avisa antes en vez de dejar que el guardado falle.
 */
const MAX_ITEMS = 8;

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
  const [cart, setCart] = useState<Record<string, number>>({});
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

  useEffect(() => {
    setCategory((current) => {
      if (current && categories.some((item) => item.id === current)) return current;
      return categories[0]?.id ?? null;
    });
  }, [categories]);

  const shown = products.filter((product) => product.category === category);
  const selections = products.filter((product) => cart[product.id]);
  const total = useMemo(
    () => selections.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0),
    [cart, selections],
  );

  function change(product: Product, delta: number) {
    setError("");
    setCart((current) => {
      const next = Math.max(0, Math.min(MAX_QTY, (current[product.id] ?? 0) + delta));
      if (next === 0) {
        const copy = { ...current };
        delete copy[product.id];
        return copy;
      }
      if (!current[product.id] && Object.keys(current).length >= MAX_ITEMS) {
        setError(`Una orden admite hasta ${MAX_ITEMS} productos distintos.`);
        return current;
      }
      return { ...current, [product.id]: next };
    });
  }

  async function submit(charge: PaymentMethod | null) {
    if (!selections.length) return setError("Agrega al menos un producto.");
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
        items: selections.map((product) => ({
          productId: product.id,
          quantity: cart[product.id]!,
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
                const quantity = cart[product.id] ?? 0;
                const soldOut = product.soldOut;
                return (
                  <button
                    key={product.id}
                    className={`manual-product ${quantity ? "picked" : ""} ${soldOut ? "sold-out" : ""}`}
                    disabled={soldOut}
                    onClick={() => change(product, 1)}
                  >
                    <span className="manual-product-name">{product.name}</span>
                    <span className="manual-product-price">{money.format(product.price)}</span>
                    <span className="manual-product-stock">
                      {soldOut ? "Agotado" : `${product.stock} uds`}
                    </span>
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
              {selections.map((product) => (
                <div className="manual-line" key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <small>{money.format(product.price)} c/u</small>
                  </div>
                  <div className="sb-qty manual-qty">
                    <button onClick={() => change(product, -1)}>−</button>
                    <span>{cart[product.id]}</span>
                    <button
                      onClick={() => change(product, 1)}
                      disabled={(cart[product.id] ?? 0) >= MAX_QTY}
                    >
                      +
                    </button>
                  </div>
                  <strong>{money.format(product.price * cart[product.id]!)}</strong>
                </div>
              ))}
              {!selections.length && <p className="reference-empty">Toca un producto para agregarlo.</p>}
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
    </div>
  );
}
