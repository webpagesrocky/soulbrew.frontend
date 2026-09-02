import { useState } from "react";
import { deleteProduct, updateProduct } from "../../api/collections";
import { effectiveRecipe } from "../../api/costing";
import { errorMessage } from "../../api/errors";
import type { Category, Product } from "../../types";
import { ImageField } from "./ImageField";

interface Props {
  product: Product;
  categories: Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export function ProductEditor({ product, categories, onClose, onSaved, onError }: Props) {
  const [image, setImage] = useState<string | null>(product.imageUrl);
  const [busy, setBusy] = useState(false);

  // Con receta, el costo se calcula de los insumos y el campo manual sobra.
  const hasRecipe = effectiveRecipe(product, categories).length > 0;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await updateProduct(product.id, {
        name: String(data.get("name")),
        description: String(data.get("description") ?? "").trim() || null,
        category: String(data.get("category")),
        imageUrl: image,
        price: Number(data.get("price")),
        cost: Number(data.get("cost") ?? 0) || 0,
        active: data.get("active") === "on",
      });
      onSaved(`"${String(data.get("name"))}" actualizado.`);
      onClose();
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo actualizar el producto"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}" definitivamente?\n\n` +
        "• Sus movimientos de inventario se borran y dejan de aparecer en Reportes.\n" +
        "• Las ventas ya registradas SÍ se conservan: cada orden guarda su propio " +
        "nombre y precio, así que tus ingresos no cambian.\n" +
        "• Si este producto aparece en una venta pagada, esa venta ya no se podrá cancelar.\n\n" +
        'Si sólo quieres retirarlo del menú, cancela y desmarca "Visible en el menú público": ' +
        "eso es reversible.",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const removed = await deleteProduct(product.id);
      onSaved(
        removed > 0
          ? `"${product.name}" eliminado junto con ${removed} ${removed === 1 ? "movimiento de inventario" : "movimientos de inventario"}.`
          : `"${product.name}" eliminado.`,
      );
      onClose();
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo eliminar el producto"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-backdrop" onClick={onClose}>
      <form
        className="editor-card compact-form"
        onSubmit={save}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="editor-head">
          <h2>Editar producto</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label>Nombre</label>
        <input name="name" defaultValue={product.name} required minLength={2} maxLength={120} />

        <label>Descripción</label>
        <textarea name="description" defaultValue={product.description ?? ""} maxLength={500} />

        <label>Categoría</label>
        <select name="category" defaultValue={product.category} required>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.emoji} {category.name}
            </option>
          ))}
          {/* Si la categoría del producto ya no existe, se conserva visible para
              que guardar no la cambie por accidente. */}
          {!categories.some((category) => category.id === product.category) && (
            <option value={product.category}>{product.category} (no existe)</option>
          )}
        </select>

        <div className="price-cost-fields">
          <div>
            <label>Precio de venta</label>
            <input
              name="price"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={product.price}
              required
            />
          </div>
          <div>
            <label>Costo de respaldo</label>
            <input
              name="cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product.cost || ""}
              placeholder="0.00"
              disabled={hasRecipe}
            />
          </div>
        </div>
        <p className="editor-note">
          {hasRecipe ? (
            <>
              Este producto ya tiene receta, así que su costo se calcula solo de los insumos y este
              campo queda apagado. Ajusta la receta con el botón <strong>Receta</strong> de la lista.
            </>
          ) : (
            <>
              Mientras no tenga receta, la ganancia del reporte usa este número. En cuanto le pongas
              receta (suya o de su categoría), el costo pasa a salir de los insumos y esto se ignora.
            </>
          )}
        </p>

        <label>Imagen</label>
        <ImageField value={image} onChange={setImage} onError={onError} />

        <label className="editor-check">
          <input type="checkbox" name="active" defaultChecked={product.active} />
          <span>Visible en el menú público</span>
        </label>

        <p className="editor-note">
          Existencias actuales: {product.stock} uds. El inventario no se edita aquí — se mueve
          al vender, cancelar o con un ajuste manual.
        </p>

        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="reference-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        <div className="editor-danger">
          <button type="button" onClick={() => void remove()} disabled={busy}>
            Eliminar producto
          </button>
          <small>
            Para retirarlo del menú sin perderlo, mejor desmarca “Visible en el menú público”.
          </small>
        </div>
      </form>
    </div>
  );
}
