import { useEffect, useState } from "react";
import {
  createOptionGroup,
  subscribeCategories,
  deleteOptionGroup,
  subscribeOptionGroups,
  updateOptionGroup,
} from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Category, OptionChoice, OptionGroup } from "../../types";
import { ImageField } from "./ImageField";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Tope por grupo. Lo imponen las reglas, que validan opción por opción. */
const MAX_OPTIONS = 12;

/** Id corto y estable para cada opción, para que las recetas y los tickets la sigan. */
function newOptionId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Personalizaciones del menú: tipos de leche, cold foams, endulzantes,
 * temperaturas, extras.
 *
 * Todo se arma desde aquí y cada producto elige después qué grupos le tocan,
 * así que sumar un cold foam nuevo o subirle el precio no requiere tocar el
 * código ni volver a publicar la página.
 */
export function OptionGroupsPanel() {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<OptionGroup | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeOptionGroups(setGroups, (reason) =>
        setError(errorMessage(reason, "No se pudieron cargar las personalizaciones")),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeCategories(
        (list) => setCategories(list.filter((item) => item.active)),
        (reason) => setError(errorMessage(reason, "No se pudieron cargar las categorías")),
      ),
    [],
  );

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createOptionGroup({
        name: String(data.get("name")).trim(),
        selection: String(data.get("selection")) as OptionGroup["selection"],
        required: data.get("required") === "on",
        order: groups.length + 1,
        active: true,
        // Arranca aplicando a todas; se acota al abrirlo.
        categoryIds: [],
        options: [],
      });
      form.reset();
      setMessage("Grupo creado. Ábrelo para elegir categorías y agregarle opciones.");
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo crear el grupo"));
    } finally {
      setBusy(false);
    }
  }

  async function save(group: OptionGroup) {
    setBusy(true);
    try {
      const { id, ...input } = group;
      await updateOptionGroup(id, input);
      setEditing(null);
      setMessage(`"${group.name}" guardado.`);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo guardar el grupo"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(group: OptionGroup) {
    setBusy(true);
    try {
      const { id, ...input } = group;
      await updateOptionGroup(id, { ...input, active: !group.active });
      setMessage(`"${group.name}" ${group.active ? "desactivado" : "activado"}.`);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo actualizar el grupo"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: OptionGroup) {
    if (
      !window.confirm(
        `¿Eliminar el grupo "${group.name}"?\n\n` +
          "Los productos que lo tenían dejan de ofrecerlo. Los pedidos ya hechos " +
          "conservan lo que el cliente eligió.\n\n" +
          'Si sólo quieres esconderlo por un tiempo, cancela y usa "Activo".',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteOptionGroup(group.id);
      setEditing(null);
      setMessage(`Grupo "${group.name}" eliminado.`);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo eliminar el grupo"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="panel-lead">
        Tipos de leche, cold foams, endulzantes, temperaturas y extras. Cada producto elige después
        cuáles ofrece, desde la pestaña Productos → Editar.
      </p>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      <div className="menu-admin-grid">
        <div className="menu-side-stack">
          <form className="reference-card compact-form" onSubmit={create}>
            <h2>Nuevo grupo</h2>
            <p>Por ejemplo: Tipo de leche, Cold Foam, Endulzante, Temperatura.</p>
            <input name="name" placeholder="Nombre del grupo" required minLength={2} maxLength={60} />
            <label>¿Cuántas puede elegir el cliente?</label>
            <select name="selection" defaultValue="SINGLE">
              <option value="SINGLE">Sólo una (leche, temperatura…)</option>
              <option value="MULTI">Varias (extras, toppings…)</option>
            </select>
            <label className="editor-check">
              <input type="checkbox" name="required" />
              <span>Obligatorio: el cliente tiene que elegir</span>
            </label>
            <button className="reference-primary" disabled={busy}>
              + Crear grupo
            </button>
          </form>
        </div>

        <article className="reference-card products-card">
          <div className="card-heading">
            <h2>Grupos</h2>
            <span>{groups.length} en total</span>
          </div>
          <div className="reference-products">
            {groups.map((group) => (
              <div className="reference-product option-group-row" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <small>
                    {group.categoryIds.length === 0
                      ? "Todas las categorías"
                      : group.categoryIds
                          .map((id) => categories.find((item) => item.id === id)?.name ?? id)
                          .join(", ")}{" "}
                    · {group.options.filter((option) => option.active).length} opciones ·{" "}
                    {group.selection === "SINGLE" ? "elige una" : "elige varias"}
                    {group.required && ", obligatorio"}
                  </small>
                </div>
                <button
                  type="button"
                  className={`avail-toggle ${group.active ? "available" : "unavailable manual"}`}
                  disabled={busy}
                  onClick={() => void toggleActive(group)}
                >
                  ▣ {group.active ? "Activo" : "Oculto"}
                </button>
                <button className="product-edit" onClick={() => setEditing(group)}>
                  Opciones
                </button>
              </div>
            ))}
            {!groups.length && (
              <p className="reference-empty">
                Aún no hay personalizaciones. Crea la primera aquí a la izquierda.
              </p>
            )}
          </div>
        </article>
      </div>

      {editing && (
        <GroupEditor
          group={editing}
          categories={categories}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={remove}
          onError={setError}
        />
      )}
    </>
  );
}

interface EditorProps {
  group: OptionGroup;
  categories: Category[];
  busy: boolean;
  onClose: () => void;
  onSave: (group: OptionGroup) => Promise<void>;
  onDelete: (group: OptionGroup) => Promise<void>;
  onError: (message: string) => void;
}

/** Edición de un grupo y de sus opciones, con nombre, recargo y foto. */
function GroupEditor({ group, categories, busy, onClose, onSave, onDelete, onError }: EditorProps) {
  const [draft, setDraft] = useState<OptionGroup>(group);
  const categoryIds = categories.map((category) => category.id);

  function patch(changes: Partial<OptionGroup>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function patchOption(id: string, changes: Partial<OptionChoice>) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.id === id ? { ...option, ...changes } : option,
      ),
    }));
  }

  function addOption() {
    setDraft((current) => ({
      ...current,
      options: [
        ...current.options,
        { id: newOptionId(), name: "", priceDelta: 0, imageUrl: null, active: true },
      ],
    }));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.options.length) return;
    const options = [...draft.options];
    [options[index], options[target]] = [options[target]!, options[index]!];
    setDraft({ ...draft, options });
  }

  function submit() {
    if (draft.options.some((option) => !option.name.trim())) {
      return onError("Cada opción necesita un nombre.");
    }
    void onSave({
      ...draft,
      options: draft.options.map((option) => ({ ...option, name: option.name.trim() })),
    });
  }

  return (
    <div className="editor-backdrop" onClick={onClose}>
      <div className="editor-card compact-form wide" onClick={(event) => event.stopPropagation()}>
        <div className="editor-head">
          <h2>{draft.name}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label>Nombre del grupo</label>
        <input
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          maxLength={60}
        />

        <label>¿Cuántas puede elegir el cliente?</label>
        <select
          value={draft.selection}
          onChange={(event) => patch({ selection: event.target.value as OptionGroup["selection"] })}
        >
          <option value="SINGLE">Sólo una</option>
          <option value="MULTI">Varias</option>
        </select>

        <label className="editor-check">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(event) => patch({ required: event.target.checked })}
          />
          <span>Obligatorio: el cliente tiene que elegir</span>
        </label>

        <label>¿En qué categorías aparece?</label>
        <p className="editor-note">
          Todos los productos de esas categorías lo ofrecen sin que tengas que marcarlos uno por
          uno. Si un producto suelto necesita algo distinto, se le pone su propia lista desde
          Productos → Editar.
        </p>
        <div className="link-products">
          <label className="link-product link-group-head">
            <input
              type="checkbox"
              checked={draft.categoryIds.length === 0}
              onChange={(event) => patch({ categoryIds: event.target.checked ? [] : categoryIds })}
            />
            <span>
              <strong>Todas las categorías</strong>
            </span>
          </label>
          {categories.map((category) => (
            <label className="link-product link-child" key={category.id}>
              <input
                type="checkbox"
                checked={draft.categoryIds.length === 0 || draft.categoryIds.includes(category.id)}
                // Sin ninguna marcada volvería a significar "todas", que no es
                // lo que se pidió: se deja al menos una.
                disabled={draft.categoryIds.length === 1 && draft.categoryIds.includes(category.id)}
                onChange={(event) => {
                  const current = draft.categoryIds.length ? draft.categoryIds : categoryIds;
                  patch({
                    categoryIds: event.target.checked
                      ? [...current, category.id]
                      : current.filter((id) => id !== category.id),
                  });
                }}
              />
              <span>
                {category.emoji} {category.name}
              </span>
            </label>
          ))}
        </div>

        <div className="option-list">
          {draft.options.map((option, index) => (
            <div className="option-row" key={option.id}>
              <div className="option-main">
                <input
                  value={option.name}
                  onChange={(event) => patchOption(option.id, { name: event.target.value })}
                  placeholder="Nombre (Almendra, Lotus…)"
                  maxLength={60}
                />
                <div className="option-price">
                  <em>+$</em>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={option.priceDelta || ""}
                    onChange={(event) =>
                      patchOption(option.id, { priceDelta: Number(event.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="option-actions">
                  <button type="button" onClick={() => move(index, -1)} aria-label="Subir">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(index, 1)} aria-label="Bajar">
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`avail-toggle ${option.active ? "available" : "unavailable manual"}`}
                    onClick={() => patchOption(option.id, { active: !option.active })}
                  >
                    {option.active ? "Activa" : "Oculta"}
                  </button>
                  <button
                    type="button"
                    className="category-delete"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        options: draft.options.filter((item) => item.id !== option.id),
                      })
                    }
                    aria-label={`Quitar ${option.name || "opción"}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="option-image">
                <ImageField
                  value={option.imageUrl}
                  onChange={(value) => patchOption(option.id, { imageUrl: value })}
                  onError={onError}
                />
                <small>
                  Opcional. Si la pones, la foto del producto cambia a ésta cuando el cliente elige
                  {option.name ? ` "${option.name}"` : " esta opción"}.
                </small>
              </div>
            </div>
          ))}
          {!draft.options.length && (
            <p className="reference-empty">Este grupo todavía no tiene opciones.</p>
          )}
        </div>

        {draft.options.length < MAX_OPTIONS ? (
          <button type="button" onClick={addOption}>
            + Agregar opción
          </button>
        ) : (
          <small className="editor-note">Máximo {MAX_OPTIONS} opciones por grupo.</small>
        )}

        <small className="editor-note">
          El recargo se suma al precio del producto. Déjalo en 0 si la opción no cuesta extra — así
          el cliente ve sólo el nombre. Ejemplo: Lotus {money.format(15)} extra.
        </small>

        <div className="editor-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="reference-primary" disabled={busy} onClick={submit}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <div className="editor-danger">
          <button type="button" disabled={busy} onClick={() => void onDelete(draft)}>
            Eliminar grupo
          </button>
        </div>
      </div>
    </div>
  );
}
