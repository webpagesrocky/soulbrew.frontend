import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { Product, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CatalogPanel({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "SOLD_OUT">("ALL");

  async function load() {
    try { setProducts((await api<{ products: Product[] }>("/products")).products); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo"); }
  }
  useEffect(() => { void load(); }, []);

  const visibleProducts = useMemo(() => products.filter((product) => {
    if (filter === "AVAILABLE") return product.active && product.stock > 0;
    if (filter === "SOLD_OUT") return product.stock === 0;
    return true;
  }), [filter, products]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/products", { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description"), price: Number(form.get("price")) }) });
      event.currentTarget.reset(); setMessage("Producto creado con inventario inicial en cero."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el producto"); }
  }

  async function adjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/inventory/adjustments", { method: "POST", body: JSON.stringify({ productId: Number(form.get("productId")), quantityChange: Number(form.get("quantityChange")), reason: form.get("reason") }) });
      event.currentTarget.reset(); setMessage("Inventario ajustado y movimiento registrado."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ajustar el inventario"); }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading"><h1>Administrar menú</h1><p>Los cambios se reflejan automáticamente en el menú público.</p></div>
      {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
      <div className="menu-admin-grid">
        <div className="menu-side-stack">
          <form className="reference-card compact-form" onSubmit={create}><h2>Nuevo producto</h2><input name="name" placeholder="Nombre del producto" required minLength={2}/><textarea name="description" placeholder="Descripción" maxLength={500}/><div className="inline-form"><input name="price" placeholder="Precio" type="number" min="0.01" step="0.01" required/><button className="reference-primary">+ Agregar</button></div></form>
          {user.role === "ADMIN" && <form className="reference-card compact-form" onSubmit={adjust}><h2>Ajustar inventario</h2><p>Los ajustes manuales quedan registrados.</p><select name="productId" required><option value="">Selecciona producto…</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.stock} uds</option>)}</select><input name="quantityChange" placeholder="Cantidad: + entrada / − salida" type="number" step="1" required/><input name="reason" placeholder="Motivo del ajuste" required minLength={4}/><button className="reference-primary">Registrar ajuste</button></form>}
        </div>
        <article className="reference-card products-card">
          <div className="card-heading"><h2>Productos</h2><span>{products.length} productos</span></div>
          <div className="filter-pills"><button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>Todos</button><button className={filter === "AVAILABLE" ? "active" : ""} onClick={() => setFilter("AVAILABLE")}>Disponibles</button><button className={filter === "SOLD_OUT" ? "active" : ""} onClick={() => setFilter("SOLD_OUT")}>Agotados</button></div>
          <div className="reference-products">
            {visibleProducts.map((product) => <div className="reference-product" key={product.id}><div className="product-thumbnail">{product.name.slice(0, 1)}</div><div><strong>{product.name}</strong><small>{product.description || "Producto Soul Brew"} · {money.format(product.price)}</small></div><span className={product.active && product.stock > 0 ? "available" : "unavailable"}>▣ {product.active && product.stock > 0 ? "Disponible" : "Agotado"}</span><b>{product.stock} uds</b></div>)}
            {!visibleProducts.length && <p className="reference-empty">No hay productos en este filtro.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
