import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Product } from "../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function PublicView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<{ products: Product[] }>("/products/public")
      .then((result) => setProducts(result.products))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const selections = products.filter((product) => cart[product.id]);
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

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!selections.length) return setError("Elige al menos un producto.");
    setSending(true);
    setError("");
    try {
      const result = await api<{ order: { code: string; total: number } }>("/orders/public", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          items: selections.map((product) => ({ productId: product.id, quantity: cart[product.id] })),
        }),
      });
      setMessage(`¡Orden ${result.order.code} recibida! Paga ${money.format(result.order.total)} en caja.`);
      setCustomerName("");
      setCart({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos crear tu orden");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="public-shell">
      <header className="public-header">
        <Link to="/" className="brand"><span>SB</span> SoulBrew</Link>
        <Link to="/login" className="staff-link">Acceso del equipo →</Link>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Tu pausa, recién preparada</p>
          <h1>Café con alma.<br />Sin hacer fila.</h1>
          <p>Arma tu orden desde aquí y paga en caja cuando esté lista.</p>
        </div>
        <div className="hero-mark" aria-hidden="true">☕</div>
      </section>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="store-layout">
        <section>
          <div className="section-heading">
            <p className="eyebrow">Nuestro menú</p>
            <h2>Elige algo especial</h2>
          </div>
          {loading ? <p>Cargando el menú…</p> : (
            <div className="product-grid">
              {products.map((product) => (
                <article className={`product-card ${product.stock === 0 ? "sold-out" : ""}`} key={product.id}>
                  <div className="product-art">{product.name.slice(0, 1).toUpperCase()}</div>
                  <div className="product-copy">
                    <div className="product-title-row">
                      <h3>{product.name}</h3>
                      <strong>{money.format(product.price)}</strong>
                    </div>
                    <p>{product.description || "Preparado al momento con ingredientes de la casa."}</p>
                    {product.stock > 0 ? (
                      <div className="quantity-control">
                        <button onClick={() => changeQuantity(product, -1)} disabled={!cart[product.id]}>−</button>
                        <span>{cart[product.id] ?? 0}</span>
                        <button onClick={() => changeQuantity(product, 1)} disabled={(cart[product.id] ?? 0) >= product.stock}>+</button>
                      </div>
                    ) : <span className="stock-label">Agotado por hoy</span>}
                  </div>
                </article>
              ))}
              {!products.length && !loading && <p>Aún no hay productos disponibles.</p>}
            </div>
          )}
        </section>

        <aside className="cart-card">
          <p className="eyebrow">Tu orden</p>
          <h2>Todo listo</h2>
          <div className="cart-lines">
            {selections.map((product) => (
              <div className="cart-line" key={product.id}>
                <span>{cart[product.id]} × {product.name}</span>
                <strong>{money.format(product.price * cart[product.id])}</strong>
              </div>
            ))}
            {!selections.length && <p className="muted">Tu selección aparecerá aquí.</p>}
          </div>
          <div className="cart-total"><span>Total</span><strong>{money.format(total)}</strong></div>
          <form onSubmit={placeOrder}>
            <label>¿A nombre de quién?</label>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} minLength={2} required placeholder="Tu nombre" />
            <button className="primary-button" disabled={sending || !selections.length}>{sending ? "Enviando…" : "Enviar orden"}</button>
          </form>
          <small>El método de pago se elige directamente en caja.</small>
        </aside>
      </div>
    </main>
  );
}

