import { useState } from "react";
import {
  categoryId,
  createCategory,
  deleteCategory,
  setCategoryRecipe,
  updateCategory,
} from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Category, Product } from "../../types";
import { RecipeEditor } from "./RecipeEditor";

interface Props {
  categories: Category[];
  products: Product[];
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}

export function CategoryManager({ categories, products, onMessage, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [recipeOf, setRecipeOf] = useState<Category | null>(null);

  const usageCount = (id: string) => products.filter((product) => product.category === id).length;

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name")).trim();
    const id = categoryId(name);

    if (!id) return onError("Ese nombre no genera un identificador válido.");
    if (categories.some((item) => item.id === id)) return onError("Ya existe una categoría así.");

    setBusy(true);
    try {
      await createCategory(id, {
        name,
        emoji: String(data.get("emoji") ?? "").trim(),
        order: categories.length + 1,
        active: true,
        // La receta se arma después, cuando ya existen los insumos.
        recipe: [],
      });
      form.reset();
      onMessage(`Categoría "${name}" creada.`);
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo crear la categoría"));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: Category) {
    setBusy(true);
    try {
      await updateCategory(category.id, { ...category, active: !category.active });
      onMessage(`"${category.name}" ${category.active ? "ocultada del" : "visible en el"} menú.`);
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo actualizar la categoría"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    setBusy(true);
    try {
      await deleteCategory(category.id);
      onMessage(`Categoría "${category.name}" eliminada.`);
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo eliminar la categoría"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <form className="reference-card compact-form" onSubmit={add}>
      <h2>Categorías</h2>
      <p>Se muestran como pestañas en el menú público.</p>

      <div className="category-list">
        {categories.map((category) => {
          const inUse = usageCount(category.id);
          return (
            <div className="category-row" key={category.id}>
              <span className="category-emoji">{category.emoji || "•"}</span>
              <div>
                <strong>{category.name}</strong>
                <small>
                  {inUse === 1 ? "1 producto" : `${inUse} productos`}
                  {category.recipe.length > 0 &&
                    ` · ${category.recipe.length} ${category.recipe.length === 1 ? "insumo" : "insumos"}`}
                </small>
              </div>
              <button
                type="button"
                className={category.recipe.length ? "pill-on" : "pill-off"}
                disabled={busy}
                title="Insumos que consume cada unidad vendida"
                onClick={() => setRecipeOf(category)}
              >
                Receta
              </button>
              <button
                type="button"
                className={category.active ? "pill-on" : "pill-off"}
                disabled={busy}
                onClick={() => void toggle(category)}
              >
                {category.active ? "Visible" : "Oculta"}
              </button>
              <button
                type="button"
                className="category-delete"
                // Borrar una categoría con productos los dejaría apuntando a
                // algo inexistente, y las reglas ya no permitirían editarlos.
                disabled={busy || inUse > 0}
                title={inUse > 0 ? "Tiene productos asignados" : "Eliminar"}
                onClick={() => void remove(category)}
              >
                ✕
              </button>
            </div>
          );
        })}
        {!categories.length && <p className="reference-empty">Aún no hay categorías.</p>}
      </div>

      <div className="inline-form category-add">
        <input name="emoji" placeholder="🍵" maxLength={4} aria-label="Emoji" />
        <input name="name" placeholder="Nombre de la categoría" required minLength={2} maxLength={40} />
        <button className="reference-primary" disabled={busy}>+ Agregar</button>
      </div>
    </form>

    {/* Fuera del <form> a propósito: dentro, un Enter en la cantidad de un
        ingrediente enviaría el alta de categoría en vez de guardar la receta. */}
    {recipeOf && (
      <RecipeEditor
        title={`Receta · ${recipeOf.emoji} ${recipeOf.name}`}
        hint={
          <>
            Lo que consume <strong>una unidad vendida</strong> de esta categoría. La usan todos sus
            productos, salvo los que tengan receta propia.
          </>
        }
        recipe={recipeOf.recipe}
        onSave={async (recipe) => {
          await setCategoryRecipe(recipeOf.id, recipe);
          onMessage(
            recipe.length
              ? `Receta de "${recipeOf.name}" guardada: ${recipe.length} ${recipe.length === 1 ? "insumo" : "insumos"} por unidad.`
              : `"${recipeOf.name}" ya no descuenta insumos al vender.`,
          );
        }}
        onClose={() => setRecipeOf(null)}
        onError={onError}
      />
    )}
    </>
  );
}
