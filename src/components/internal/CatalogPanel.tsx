import { useEffect, useMemo, useState } from "react";
import {
  createProduct,
  setProductRecipe,
  setProductSoldOut,
  subscribeCategories,
  subscribeProducts,
  subscribeSupplies,
} from "../../api/collections";
import { productCost } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import type { Category, Product, Supply, User } from "../../types";
import { CategoryManager } from "./CategoryManager";
import { ImageField } from "./ImageField";
import { ProductEditor } from "./ProductEditor";
import { RecipeEditor } from "./RecipeEditor";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CatalogPanel({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ALL" | "AVAILABLE" | "SOLD_OUT">("ALL");
  const [image, setImage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [recipeOf, setRecipeOf] = useState<Product | null>(null);

  useEffect(
    () =>
      subscribeSupplies(setSupplies, (reason) =>
        setError(errorMessage(reason, "No se pudieron cargar los insumos")),
      ),
    [],
  );

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

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (filter === "AVAILABLE") return product.active && !product.soldOut;
        if (filter === "SOLD_OUT") return product.soldOut;
        return true;
      }),
    [filter, products],
  );

  /**
   * El listado se agrupa por categoría, en el mismo orden que el menú público,
   * para que revisar la carta aquí se parezca a verla del lado del cliente.
   * Al final van los productos cuya categoría ya no existe, que si no
   * quedarían invisibles.
   */
  const groupedProducts = useMemo(() => {
    const groups = categories.map((category) => ({
      id: category.id,
      label: `${category.emoji} ${category.name}`.trim(),
      items: visibleProducts.filter((product) => product.category === category.id),
    }));

    const known = new Set(categories.map((category) => category.id));
    const orphans = visibleProducts.filter((product) => !known.has(product.category));
    if (orphans.length) {
      groups.push({ id: "__sin_categoria", label: "Sin categoría", items: orphans });
    }
    return groups.filter((group) => group.items.length > 0);
  }, [categories, visibleProducts]);

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
        cost: Number(data.get("cost") ?? 0) || 0,
      });
      form.reset();
      setImage(null);
      setMessage("Producto creado con inventario inicial en cero.");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo crear el producto"));
    }
  }

  async function toggleSoldOut(product: Product) {
    try {
      await setProductSoldOut(product.id, !product.soldOut);
      setMessage(
        product.soldOut
          ? `"${product.name}" vuelve a estar disponible.`
          : `"${product.name}" marcado como agotado.`,
      );
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo actualizar la disponibilidad"));
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

            <ImageField value={image} onChange={setImage} onError={setError} allowUrl />

            <div className="price-cost-row">
              <input
                name="price"
                placeholder="Precio de venta"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
              <input name="cost" placeholder="Costo" type="number" min="0" step="0.01" />
            </div>
            <button className="reference-primary">+ Agregar</button>
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
            {groupedProducts.map((group) => (
              <section className="product-group" key={group.id}>
                <h3 className="product-group-title">
                  <span>{group.label}</span>
                  <small>
                    {group.items.length} {group.items.length === 1 ? "producto" : "productos"}
                  </small>
                </h3>
                {group.items.map((product) => {
                  const cost = productCost(product, categories, supplies);
                  return (
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
                        {money.format(product.price)} · cuesta{" "}
                        {cost.source === "NONE" ? "—" : money.format(cost.value)}
                        {cost.source === "MANUAL" && " (a mano)"}
                        {cost.source !== "NONE" && cost.source !== "MANUAL" && (
                          <> · gana {money.format(product.price - cost.value)}</>
                        )}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={`avail-toggle ${product.recipe.length ? "available" : "unavailable manual"}`}
                      onClick={() => setRecipeOf(product)}
                      title={
                        product.recipe.length
                          ? "Tiene receta propia"
                          : cost.source === "CATEGORY_RECIPE"
                            ? "Usa la receta de su categoría"
                            : "Sin receta"
                      }
                    >
                      ▤ {product.recipe.length ? "Receta propia" : "Receta"}
                    </button>
                    <button
                      type="button"
                      className={`avail-toggle ${product.soldOut ? "unavailable manual" : "available"}`}
                      onClick={() => void toggleSoldOut(product)}
                      title={product.soldOut ? "Marcar disponible de nuevo" : "Marcar agotado por hoy"}
                    >
                      ▣ {product.soldOut ? "Agotado (hoy)" : "Disponible"}
                    </button>
                    <button
                      className="product-edit"
                      onClick={() => setEditing(product)}
                      aria-label={`Editar ${product.name}`}
                    >
                      Editar
                    </button>
                  </div>
                  );
                })}
              </section>
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

      {recipeOf && (
        <RecipeEditor
          title={`Receta · ${recipeOf.name}`}
          hint={
            <>
              Lo que consume <strong>una unidad</strong> de este producto en particular. Si lo dejas
              vacío, usa la receta de su categoría.
            </>
          }
          recipe={recipeOf.recipe}
          fallback={{
            label: `la categoría ${categories.find((c) => c.id === recipeOf.category)?.name ?? recipeOf.category}`,
            recipe: categories.find((c) => c.id === recipeOf.category)?.recipe ?? [],
          }}
          onSave={async (recipe) => {
            await setProductRecipe(recipeOf.id, recipe);
            setMessage(
              recipe.length
                ? `Receta propia de "${recipeOf.name}" guardada.`
                : `"${recipeOf.name}" vuelve a usar la receta de su categoría.`,
            );
            setError("");
          }}
          onClose={() => setRecipeOf(null)}
          onError={setError}
        />
      )}
    </section>
  );
}
