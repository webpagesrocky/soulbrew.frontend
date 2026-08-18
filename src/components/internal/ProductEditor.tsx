import { useState } from "react";
import { updateProduct } from "../../api/collections";
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

        <label>Precio</label>
        <input
          name="price"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={product.price}
          required
        />

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
      </form>
    </div>
  );
}
