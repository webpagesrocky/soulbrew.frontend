import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  subscribeCategories,
  subscribeOptionGroups,
  subscribePublicProducts,
} from "../api/collections";
import { errorMessage } from "../api/errors";
import { resolveOptionGroups } from "../api/options";
import { createPublicOrder, type LoyaltyResult } from "../api/transactions";
import { Icon } from "../components/Icon";
import { LoyaltyCard } from "../components/LoyaltyCard";
import { ProductCustomizer } from "../components/ProductCustomizer";
import type { ChosenOption, Category, OptionGroup, Product, ProductCategory } from "../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/**
 * Tope de unidades por producto en un pedido. El stock real ya no limita la
 * venta (sólo el interruptor manual "agotado" lo hace); este número evita
 * carritos absurdos, no representa inventario disponible.
 */
const MAX_QTY = 20;

/**
 * Un renglón del carrito. Lleva su propia personalización, así que el mismo
 * producto puede estar dos veces con opciones distintas.
 */
interface CartLine {
  id: string;
  productId: string;
  quantity: number;
  options: ChosenOption[];
}

/** Identidad de un renglón: mismo producto y mismas opciones se suman. */
function lineKey(productId: string, options: ChosenOption[]) {
  return `${productId}|${options.map((option) => option.optionId).sort().join(",")}`;
}

export function PublicView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [customizing, setCustomizing] = useState<{ product: Product; line: CartLine | null } | null>(
    null,
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [loyalty, setLoyalty] = useState<{ name: string; phone: string; result: LoyaltyResult } | null>(null);

  // El menú se mantiene en vivo: si en el panel interno agotan o desactivan un
  // producto, desaparece de la carta sin que nadie recargue la página.
  useEffect(
    () =>
      subscribePublicProducts(
        (rows) => {
          setProducts(rows);
          setLoading(false);
        },
        (reason) => {
          setError(errorMessage(reason, "No pudimos cargar el menú"));
          setLoading(false);
        },
      ),
    [],
  );

  useEffect(
    () =>
      subscribeCategories(
        (rows) => setCategories(rows.filter((item) => item.active)),
        (reason) => setError(errorMessage(reason, "No pudimos cargar las categorías")),
      ),
    [],
  );

  // Las personalizaciones son un extra: si no se pueden leer, el menú sigue
  // funcionando y los productos se agregan con su precio de lista. No se le
  // enseña un error al cliente por algo que no le impide pedir.
  useEffect(
    () =>
      subscribeOptionGroups(setGroups, () => setGroups([])),
    [],
  );

  // La primera categoría se elige sola en cuanto llegan: cuáles existen ya no
  // se sabe hasta que Firestore responde.
  useEffect(() => {
    setCategory((current) => {
      if (current && categories.some((item) => item.id === current)) return current;
      return categories[0]?.id ?? null;
    });
  }, [categories]);

  const activeCategory = categories.find((item) => item.id === category) ?? null;
  const categoryProducts = products.filter((product) => product.category === category);

  const productOf = (id: string) => products.find((product) => product.id === id);

  /** Precio de un renglón: el del producto más lo que cobren sus opciones. */
  const linePrice = (line: CartLine) => {
    const base = productOf(line.productId)?.price ?? 0;
    return line.options.reduce((sum, option) => sum + option.priceDelta, base);
  };

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = useMemo(
    () => cart.reduce((sum, line) => sum + linePrice(line) * line.quantity, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, products],
  );

  /**
   * Abre la ventana de personalización. Si el producto no tiene grupos, se va
   * derecho al carrito: no tiene caso enseñar una ventana sin nada que elegir.
   */
  function openProduct(product: Product) {
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
      return [...current, { id: `${key}-${Date.now()}`, productId, options, quantity }];
    });
  }

  function changeQuantity(lineId: string, difference: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.id === lineId
            ? { ...line, quantity: Math.max(0, Math.min(MAX_QTY, line.quantity + difference)) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(lineId: string) {
    setCart((current) => current.filter((line) => line.id !== lineId));
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!cart.length) return setError("Elige al menos un producto.");
    if (customerName.trim().length < 2) return setError("Escribe tu nombre.");
    if (customerPhone && !/^\d{10}$/.test(customerPhone)) {
      return setError("El número de celular debe tener 10 dígitos.");
    }
    setSending(true);
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
      setMessage(`¡Orden ${order.code} recibida! Paga ${money.format(order.total)} en caja.`);
      if (order.loyalty) {
        setLoyalty({ name: order.customerName, phone: order.customerPhone, result: order.loyalty });
      }
      setCustomerName("");
      setCustomerPhone("");
      setCart([]);
      setCartOpen(false);
    } catch (reason) {
      setError(errorMessage(reason, "No pudimos crear tu orden"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sb-page">
      <header className="sb-header">
        <span className="sb-logo">Soul Brew</span>
        <nav className="sb-nav">
          <a href="#menu">Menú</a>
          <a href="#follow">Síguenos</a>
        </nav>
        <button className="sb-cart-btn" onClick={() => setCartOpen(true)} aria-label="Ver mi orden">
          <Icon name="bag" size={18} />
          {itemCount > 0 && <span className="sb-cart-badge">{itemCount}</span>}
        </button>
      </header>

      <section className="sb-hero">
        {/* Si aún no se ha subido el archivo del logo, se cae al título de
            texto en vez de dejar una imagen rota. */}
        {logoBroken ? (
          <h1>Soul Brew</h1>
        ) : (
          <img
            className="sb-hero-logo"
            // Con BASE_URL y no con "/": en GitHub Pages el sitio cuelga de
            // /soulbrew.frontend/, así que la ruta absoluta se iba a la raíz
            // del dominio y el logo caía siempre al título de respaldo.
            src={`${import.meta.env.BASE_URL}logo-light.png`}
            alt="Soul Brew"
            onError={() => setLogoBroken(true)}
          />
        )}
        <div className="sb-hero-actions">
          <a href="#menu" className="sb-btn sb-btn-light">Ver menú</a>
          <a href="#menu" className="sb-btn sb-btn-outline">Ordenar</a>
        </div>
      </section>

      {message && <div className="notice success sb-notice">{message}</div>}
      {error && <div className="notice error sb-notice">{error}</div>}

      <section className="sb-menu" id="menu">
        <p className="sb-eyebrow">Nuestro menú</p>
        <h2>Elige tu categoría</h2>

        <div className="sb-pills">
          {categories.map((item) => (
            <button
              key={item.id}
              className={category === item.id ? "active" : ""}
              onClick={() => setCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="sb-loading">Cargando el menú…</p>
        ) : (
          <div className="sb-product-grid">
            {categoryProducts.map((product) => {
              // La disponibilidad la decide sólo el interruptor manual
              // "agotado"; el stock es un dato contable, no un bloqueo de venta.
              const outOfStock = product.soldOut;
              return (
                <article
                  className={`sb-product-card ${outOfStock ? "sold-out" : ""}`}
                  key={product.id}
                  onClick={() => !outOfStock && openProduct(product)}
                >
                  <div className="sb-product-art">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} loading="lazy" />
                    ) : (
                      (activeCategory?.emoji ?? "☕")
                    )}
                    {!outOfStock && (
                      <button
                        className="sb-add-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          openProduct(product);
                        }}
                        aria-label={`Agregar ${product.name}`}
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="sb-product-body">
                    <div className="sb-product-row">
                      <h3>{product.name}</h3>
                      <strong>{money.format(product.price)}</strong>
                    </div>
                    <p>{product.description || "Preparado al momento con ingredientes de la casa."}</p>
                    {outOfStock && <span className="sb-stock-label">Agotado por hoy</span>}
                  </div>
                </article>
              );
            })}
            {!categoryProducts.length && <p className="sb-empty">Próximamente en esta categoría.</p>}
          </div>
        )}
      </section>

      <section className="sb-follow" id="follow">
        <p className="sb-eyebrow">Síguenos</p>
        <a className="sb-social" href="https://www.instagram.com/soulbrewmxl/?hl=es" target="_blank" rel="noreferrer" aria-label="Instagram de Soul Brew">
          <Icon name="instagram" size={20} />
        </a>
      </section>

      <footer className="sb-footer">
        <div>
          <strong>Soul Brew</strong>
          <p>Av. Acatita de Bajan 1299, Independencia, 21290<br />Mexicali, B.C.</p>
          <p>+52 686 000 0000</p>
          <a className="sb-map-link" href="https://maps.google.com/?q=Av.+Acatita+de+Bajan+1299,+Mexicali" target="_blank" rel="noreferrer">
            Ver ubicación en el mapa
          </a>
        </div>
        <div className="sb-footer-links">
          <strong>Soul Brew</strong>
          <a href="#menu">Menú</a>
          <a href="https://www.instagram.com/soulbrewmxl/?hl=es" target="_blank" rel="noreferrer">Instagram</a>
          <Link to="/login">Acceso administrador</Link>
        </div>
        <p className="sb-copy">© {new Date().getFullYear()} Soul Brew. Todos los derechos reservados.</p>
      </footer>

      {itemCount > 0 && !cartOpen && (
        <button className="sb-cart-bar" onClick={() => setCartOpen(true)}>
          <span>{itemCount} {itemCount === 1 ? "producto" : "productos"}</span>
          <strong>{money.format(total)}</strong>
          <span>Ver orden →</span>
        </button>
      )}

      {cartOpen && (
        <div className="sb-drawer-backdrop" onClick={() => setCartOpen(false)}>
          <div className="sb-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="sb-drawer-handle" />
            <div className="sb-drawer-head">
              <h2>Tu orden</h2>
              <button onClick={() => setCartOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="sb-drawer-lines">
              {cart.map((line) => {
                const product = productOf(line.productId);
                if (!product) return null;
                return (
                  <div className="sb-drawer-line" key={line.id}>
                    <div className="sb-drawer-line-info">
                      <strong>{product.name}</strong>
                      <small>{money.format(linePrice(line))} c/u</small>
                      {line.options.length > 0 && (
                        <ul className="sb-line-options">
                          {line.options.map((option) => (
                            <li key={option.optionId}>
                              {option.groupName}: {option.optionName}
                              {option.priceDelta > 0 && ` (+${money.format(option.priceDelta)})`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {resolveOptionGroups(product, groups).length > 0 && (
                        <button
                          type="button"
                          className="sb-line-edit"
                          onClick={() => setCustomizing({ product, line })}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <button
                      className="sb-drawer-remove"
                      onClick={() => removeLine(line.id)}
                      aria-label={`Quitar ${product.name} de la orden`}
                    >
                      ✕
                    </button>
                    <div className="sb-qty">
                      <button
                        onClick={() => changeQuantity(line.id, -1)}
                        aria-label={`Una unidad menos de ${product.name}`}
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        onClick={() => changeQuantity(line.id, 1)}
                        disabled={line.quantity >= MAX_QTY}
                        aria-label={`Una unidad más de ${product.name}`}
                      >
                        +
                      </button>
                    </div>
                    <strong className="sb-drawer-line-total">
                      {money.format(linePrice(line) * line.quantity)}
                    </strong>
                  </div>
                );
              })}
              {!cart.length && <p className="muted">Aún no eliges nada.</p>}
            </div>
            <div className="sb-drawer-total"><span>Total</span><strong>{money.format(total)}</strong></div>
            <form onSubmit={placeOrder}>
              <label>Tu nombre</label>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                minLength={2}
                required
                placeholder="¿A nombre de quién?"
              />
              <label>Tu número de celular (opcional)</label>
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                placeholder="10 dígitos"
              />
              <button className="primary-button" disabled={sending || !cart.length}>{sending ? "Enviando…" : "Enviar orden"}</button>
            </form>
            <small>
              Danos tu celular y activa tu tarjeta de puntos: cada 10 compras, una bebida sale gratis. El
              método de pago se elige directamente en caja.
            </small>
          </div>
        </div>
      )}

      {customizing && (
        <ProductCustomizer
          product={customizing.product}
          groups={groups}
          initial={customizing.line?.options ?? []}
          initialQuantity={customizing.line?.quantity ?? 1}
          onClose={() => setCustomizing(null)}
          onConfirm={(options, quantity) => {
            // Editar un renglón lo reemplaza: se quita el viejo y se agrega con
            // lo nuevo, que de paso lo funde con otro igual si ya existía.
            if (customizing.line) removeLine(customizing.line.id);
            addLine(customizing.product.id, options, quantity);
            setCustomizing(null);
            setCartOpen(true);
          }}
        />
      )}

      {loyalty && (
        <div className="loyalty-backdrop" onClick={() => setLoyalty(null)}>
          <div className="loyalty-modal" onClick={(event) => event.stopPropagation()}>
            <LoyaltyCard
              name={loyalty.name}
              visits={loyalty.result.visits}
              rewardEligible={loyalty.result.rewardEligible}
            />
            <button type="button" className="loyalty-modal-close" onClick={() => setLoyalty(null)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
