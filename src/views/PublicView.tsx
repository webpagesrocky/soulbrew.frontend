import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { subscribeCategories, subscribePublicProducts } from "../api/collections";
import { errorMessage } from "../api/errors";
import { createPublicOrder } from "../api/transactions";
import { Icon } from "../components/Icon";
import type { Category, Product, ProductCategory } from "../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function PublicView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

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
  const selections = products.filter((product) => cart[product.id]);
  const itemCount = selections.reduce((sum, product) => sum + (cart[product.id] ?? 0), 0);
  const total = useMemo(
    () => selections.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0),
    [cart, selections],
  );

  function changeQuantity(product: Product, difference: number) {
    setCart((current) => {
      const next = Math.max(0, Math.min(product.stock, (current[product.id] ?? 0) + difference));
      return { ...current, [product.id]: next };
    });
  }

  function removeFromCart(product: Product) {
    setCart((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!selections.length) return setError("Elige al menos un producto.");
    setSending(true);
    setError("");
    try {
      const order = await createPublicOrder({
        customerName,
        items: selections.map((product) => ({
          productId: product.id,
          quantity: cart[product.id]!,
        })),
      });
      setMessage(`¡Orden ${order.code} recibida! Paga ${money.format(order.total)} en caja.`);
      setCustomerName("");
      setCart({});
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
        <p className="sb-eyebrow">Bienvenido a</p>
        {/* Si aún no se ha subido el archivo del logo, se cae al título de
            texto en vez de dejar una imagen rota. */}
        {logoBroken ? (
          <h1>Soul Brew</h1>
        ) : (
          <img
            className="sb-hero-logo"
            src="/logo-light.png"
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
              const quantity = cart[product.id] ?? 0;
              return (
                <article className={`sb-product-card ${product.stock === 0 ? "sold-out" : ""}`} key={product.id}>
                  <div className="sb-product-art">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} loading="lazy" />
                    ) : (
                      (activeCategory?.emoji ?? "☕")
                    )}
                    {product.stock > 0 && (
                      <button
                        className="sb-add-btn"
                        onClick={() => changeQuantity(product, 1)}
                        disabled={quantity >= product.stock}
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
                    {product.stock === 0 ? (
                      <span className="sb-stock-label">Agotado por hoy</span>
                    ) : quantity > 0 ? (
                      <div className="sb-qty">
                        <button onClick={() => changeQuantity(product, -1)}>−</button>
                        <span>{quantity}</span>
                        <button onClick={() => changeQuantity(product, 1)} disabled={quantity >= product.stock}>+</button>
                      </div>
                    ) : null}
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
              {selections.map((product) => {
                const quantity = cart[product.id]!;
                return (
                  <div className="sb-drawer-line" key={product.id}>
                    <div className="sb-drawer-line-info">
                      <strong>{product.name}</strong>
                      <small>{money.format(product.price)} c/u</small>
                    </div>
                    <button
                      className="sb-drawer-remove"
                      onClick={() => removeFromCart(product)}
                      aria-label={`Quitar ${product.name} de la orden`}
                    >
                      ✕
                    </button>
                    <div className="sb-qty">
                      <button
                        onClick={() => changeQuantity(product, -1)}
                        aria-label={`Una unidad menos de ${product.name}`}
                      >
                        −
                      </button>
                      <span>{quantity}</span>
                      <button
                        onClick={() => changeQuantity(product, 1)}
                        disabled={quantity >= product.stock}
                        aria-label={`Una unidad más de ${product.name}`}
                      >
                        +
                      </button>
                    </div>
                    <strong className="sb-drawer-line-total">
                      {money.format(product.price * quantity)}
                    </strong>
                  </div>
                );
              })}
              {!selections.length && <p className="muted">Aún no eliges nada.</p>}
            </div>
            <div className="sb-drawer-total"><span>Total</span><strong>{money.format(total)}</strong></div>
            <form onSubmit={placeOrder}>
              <label>¿A nombre de quién?</label>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} minLength={2} required placeholder="Tu nombre" />
              <button className="primary-button" disabled={sending || !selections.length}>{sending ? "Enviando…" : "Enviar orden"}</button>
            </form>
            <small>El método de pago se elige directamente en caja.</small>
          </div>
        </div>
      )}
    </div>
  );
}
