import { useState } from "react";
import { deleteProduct, updateProduct } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { approximateKb, compressImage } from "../../api/image";
import type { Category, Product } from "../../types";

interface Props {
  product: Product;
  categories: Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export function ProductEditor({ product, categories, onClose, onSaved, onError }: Props) {
  const [image, setImage] = useState<string | null>(product.imageUrl);
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageBusy(true);
    try {
      setImage(await compressImage(file));
    } catch (reason) {
      onError(errorMessage(reason, "No se pudo procesar la imagen"));
    } finally {
      setImageBusy(false);
      event.target.value = "";
    }
  }

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

  async function remove() {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}" definitivamente?\n\n` +
        "Las ventas ya registradas conservan su renglón, pero si este producto " +
        "aparece en una venta pagada, esa venta ya no se podrá cancelar.\n\n" +
        "Si sólo quieres retirarlo del menú, cancela y desmarca " +
        '"Visible en el menú público": eso es reversible.',
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteProduct(product.id);
      onSaved(`"${product.name}" eliminado.`);
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
        <div className="image-picker">
          {image ? (
            <div className="image-preview">
              <img src={image} alt="Vista previa" />
              <div>
                <small>
                  {image.startsWith("data:") ? `${approximateKb(image)} KB` : "URL externa"}
                </small>
                <button type="button" onClick={() => setImage(null)}>
                  Quitar imagen
                </button>
              </div>
            </div>
          ) : (
            <label className="image-drop">
              <input type="file" accept="image/*" onChange={pickImage} disabled={imageBusy} />
              <span>{imageBusy ? "Procesando…" : "Subir foto"}</span>
            </label>
          )}
        </div>

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
          <button className="reference-primary" disabled={busy || imageBusy}>
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
