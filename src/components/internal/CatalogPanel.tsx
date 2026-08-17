import { useEffect, useMemo, useState } from "react";
import { createProduct, subscribeCategories, subscribeProducts } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { approximateKb, compressImage } from "../../api/image";
import { adjustInventory } from "../../api/transactions";
import type { Category, Product, User } from "../../types";
import { CategoryManager } from "./CategoryManager";
import { ProductEditor } from "./ProductEditor";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CatalogPanel({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "SOLD_OUT">("ALL");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  useEffect(
    () =>
      subscribeProducts(
        (rows) => {
          setProducts(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudo cargar el catálogo")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeCategories(
        setCategories,
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [],
  );

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((item) => [item.id, item.name]));
    return (id: string) => map.get(id) ?? id;
  }, [categories]);

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (filter === "AVAILABLE") return product.active && product.stock > 0;
        if (filter === "SOLD_OUT") return product.stock === 0;
        return true;
      }),
    [filter, products],
  );

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    setError("");
    try {
      setImage(await compressImage(file));
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo procesar la imagen"));
    } finally {
      setImageBusy(false);
      event.target.value = "";
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const url = String(data.get("imageUrl") ?? "").trim();

    try {
      await createProduct({
        name: String(data.get("name")),
        description: String(data.get("description") ?? "").trim() || null,
        category: String(data.get("category")),
        // La foto subida gana sobre la URL pegada: es la acción más explícita.
        imageUrl: image ?? (url || null),
        price: Number(data.get("price")),
      });
      form.reset();
      setImage(null);
      setMessage("Producto creado con inventario inicial en cero.");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo crear el producto"));
    }
  }

  async function adjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await adjustInventory(
        String(data.get("productId")),
        Number(data.get("quantityChange")),
        String(data.get("reason")),
        { uid: user.id, name: user.name },
      );
      form.reset();
      setMessage("Inventario ajustado y movimiento registrado.");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo ajustar el inventario"));
    }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Administrar menú</h1>
        <p>Los cambios se reflejan automáticamente en el menú público.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <div className="menu-admin-grid">
        <div className="menu-side-stack">
          <form className="reference-card compact-form" onSubmit={create}>
            <h2>Nuevo producto</h2>
            <input name="name" placeholder="Nombre del producto" required minLength={2} />
            <textarea name="description" placeholder="Descripción" maxLength={500} />
            <select name="category" required defaultValue="">
              <option value="" disabled>
                Selecciona categoría…
              </option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.emoji} {category.name}
                </option>
              ))}
            </select>

            <div className="image-picker">
              {image ? (
                <div className="image-preview">
                  <img src={image} alt="Vista previa" />
                  <div>
                    <small>Imagen lista · {approximateKb(image)} KB</small>
                    <button type="button" onClick={() => setImage(null)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className="image-drop">
                    <input type="file" accept="image/*" onChange={pickImage} disabled={imageBusy} />
                    <span>{imageBusy ? "Procesando…" : "Subir foto"}</span>
                  </label>
                  <input name="imageUrl" placeholder="…o pega una URL de imagen" type="url" />
                </>
              )}
            </div>

            <div className="inline-form">
              <input
                name="price"
                placeholder="Precio"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
              <button className="reference-primary" disabled={imageBusy}>
                + Agregar
              </button>
            </div>
          </form>

          <CategoryManager
            categories={categories}
            products={products}
            onMessage={(text) => {
              setMessage(text);
              setError("");
            }}
            onError={setError}
          />

          {user.role === "ADMIN" && (
            <form className="reference-card compact-form" onSubmit={adjust}>
              <h2>Ajustar inventario</h2>
              <p>Los ajustes manuales quedan registrados.</p>
              <select name="productId" required>
                <option value="">Selecciona producto…</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name} · {product.stock} uds
                  </option>
                ))}
              </select>
              <input
                name="quantityChange"
                placeholder="Cantidad: + entrada / − salida"
                type="number"
                step="1"
                required
              />
              <input name="reason" placeholder="Motivo del ajuste" required minLength={4} />
              <button className="reference-primary">Registrar ajuste</button>
            </form>
          )}
        </div>
        <article className="reference-card products-card">
          <div className="card-heading">
            <h2>Productos</h2>
            <span>{products.length} productos</span>
          </div>
          <div className="filter-pills">
            <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>
              Todos
            </button>
            <button
              className={filter === "AVAILABLE" ? "active" : ""}
              onClick={() => setFilter("AVAILABLE")}
            >
              Disponibles
            </button>
            <button
              className={filter === "SOLD_OUT" ? "active" : ""}
              onClick={() => setFilter("SOLD_OUT")}
            >
              Agotados
            </button>
          </div>
          <div className="reference-products">
            {visibleProducts.map((product) => (
              <div className="reference-product" key={product.id}>
                <div className="product-thumbnail">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} loading="lazy" />
                  ) : (
                    product.name.slice(0, 1)
                  )}
                </div>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {categoryName(product.category)} ·{" "}
                    {product.description || "Producto Soul Brew"} · {money.format(product.price)}
                  </small>
                </div>
                <span className={product.active && product.stock > 0 ? "available" : "unavailable"}>
                  ▣ {product.active && product.stock > 0 ? "Disponible" : "Agotado"}
                </span>
                <b>{product.stock} uds</b>
                <button
                  className="product-edit"
                  onClick={() => setEditing(product)}
                  aria-label={`Editar ${product.name}`}
                >
                  Editar
                </button>
              </div>
            ))}
            {!visibleProducts.length && (
              <p className="reference-empty">No hay productos en este filtro.</p>
            )}
          </div>
        </article>
      </div>

      {editing && (
        <ProductEditor
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setMessage(text);
            setError("");
          }}
          onError={setError}
        />
      )}
    </section>
  );
}
