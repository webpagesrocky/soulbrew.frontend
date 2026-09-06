import { useEffect, useMemo, useRef, useState } from "react";
import { optionImageFor, resolveOptionGroups } from "../api/options";
import type { ChosenOption, OptionChoice, OptionGroup, OptionImage, Product } from "../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

interface Props {
  product: Product;
  groups: OptionGroup[];
  /** Fotos por categoría, para que la imagen cambie según la bebida. */
  images: OptionImage[];
  /** Selección con la que abre, para poder editar algo que ya está en el carrito. */
  initial?: ChosenOption[];
  initialQuantity?: number;
  onClose: () => void;
  onConfirm: (options: ChosenOption[], quantity: number) => void;
}

/** Tope por bebida, también impuesto por las reglas de Firestore. */
const MAX_QTY = 20;

/**
 * La selección en pantalla arrastra la foto de cada opción, que no se guarda
 * en la orden: sirve sólo para ir cambiando la imagen mientras se elige.
 */
type Picked = ChosenOption & { imageUrl: string | null };

/**
 * Ventana de personalización: foto grande arriba, los grupos que el panel le
 * asignó a este producto, y el precio actualizándose conforme se elige.
 *
 * La foto cambia a la de la última opción elegida que tenga imagen propia; si
 * ninguna la tiene, se queda la del producto. Así no hace falta una foto por
 * cada combinación posible, sólo por las que valga la pena enseñar.
 */
export function ProductCustomizer({
  product,
  groups,
  images,
  initial = [],
  initialQuantity = 1,
  onClose,
  onConfirm,
}: Props) {
  const [chosen, setChosen] = useState<Picked[]>(() =>
    // Al reabrir algo del carrito se recupera la foto de cada opción elegida,
    // que la orden no guarda, buscándola por su grupo y la categoría.
    initial.map((item) => {
      const group = groups.find((entry) => entry.id === item.groupId);
      return {
        ...item,
        imageUrl: group?.hasImages
          ? optionImageFor(
              item.groupId,
              item.optionId,
              group.options.find((option) => option.id === item.optionId)?.imageUrl ?? null,
              product.category,
              images,
            )
          : null,
      };
    }),
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const [showErrors, setShowErrors] = useState(false);

  const applicable = useMemo(() => resolveOptionGroups(product, groups), [product, groups]);

  const missing = applicable.filter(
    (group) => group.required && !chosen.some((item) => item.groupId === group.id),
  );

  const extras = chosen.reduce((sum, item) => sum + item.priceDelta, 0);
  const unitPrice = product.price + extras;

  // La última elección con foto propia manda. Se recorre al revés para que la
  // más reciente gane sobre las anteriores.
  const image =
    [...chosen].reverse().find((item) => item.imageUrl)?.imageUrl ?? product.imageUrl;

  // Al elegir el cold foam la foto cambia arriba, pero el dedo está abajo en
  // los chips y no se ve nada. Cada vez que la imagen cambia se sube sola.
  const body = useRef<HTMLDivElement>(null);
  const shown = useRef(image);
  useEffect(() => {
    if (shown.current === image) return;
    shown.current = image;
    // Salto directo y no `behavior: 'smooth'`: hay navegadores que se comen
    // el desplazamiento suave y entonces no subiría nada.
    if (body.current) body.current.scrollTop = 0;
  }, [image]);

  function pick(group: OptionGroup, option: OptionChoice) {
    const already = chosen.some((item) => item.optionId === option.id);
    const entry: Picked = {
      groupId: group.id,
      groupName: group.name,
      optionId: option.id,
      optionName: option.name,
      priceDelta: option.priceDelta,
      // Un grupo sin fotos no toca la imagen: el tipo de leche no cambia
      // cómo se ve la bebida, el cold foam sí.
      imageUrl: group.hasImages
        ? optionImageFor(group.id, option.id, option.imageUrl, product.category, images)
        : null,
    };

    setChosen((current) => {
      if (group.selection === "MULTI") {
        return already
          ? current.filter((item) => item.optionId !== option.id)
          : [...current, entry];
      }
      // De selección única: al tocar la ya elegida se deselecciona, salvo que
      // el grupo sea obligatorio — ahí siempre queda una puesta.
      const others = current.filter((item) => item.groupId !== group.id);
      if (already && !group.required) return others;
      return [...others, entry];
    });
  }

  function confirm() {
    if (missing.length) return setShowErrors(true);
    onConfirm(
      chosen.map(({ groupId, groupName, optionId, optionName, priceDelta }) => ({
        groupId,
        groupName,
        optionId,
        optionName,
        priceDelta,
      })),
      quantity,
    );
  }

  return (
    <div className="sb-drawer-backdrop" onClick={onClose}>
      <div className="sb-customizer" onClick={(event) => event.stopPropagation()}>
        <button className="sb-customizer-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        <div className="sb-customizer-art">
          {image ? (
            // La `key` fuerza el fundido cada vez que la foto cambia.
            <img key={image} src={image} alt={product.name} />
          ) : (
            <span className="sb-customizer-placeholder">☕</span>
          )}
        </div>

        <div className="sb-customizer-body" ref={body}>
          <h2>Personaliza tu {product.name}</h2>
          {product.description && <p className="sb-customizer-desc">{product.description}</p>}

          {applicable.map((group) => {
            const incomplete = showErrors && missing.some((item) => item.id === group.id);
            return (
              <section className="sb-optgroup" key={group.id}>
                <h3>
                  {group.name}
                  {group.required && <span className="sb-required"> · obligatorio</span>}
                  {group.selection === "MULTI" && (
                    <span className="sb-multi"> · puedes elegir varias</span>
                  )}
                </h3>
                {/* Los extras se sienten mejor como interruptores: se prenden y
                    se apagan sueltos, no compiten entre ellos como los chips. */}
                {group.selection === "MULTI" ? (
                  <div className="sb-switches">
                    {group.options.map((option) => {
                      const on = chosen.some((item) => item.optionId === option.id);
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={`sb-switch-row ${on ? "active" : ""}`}
                          onClick={() => pick(group, option)}
                          aria-pressed={on}
                        >
                          <span>
                            {option.name}
                            {option.priceDelta > 0 && (
                              <em>+{money.format(option.priceDelta)}</em>
                            )}
                          </span>
                          <span className="sb-switch" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={`sb-chips ${incomplete ? "missing" : ""}`}>
                    {group.options.map((option) => {
                      const on = chosen.some((item) => item.optionId === option.id);
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={on ? "active" : ""}
                          onClick={() => pick(group, option)}
                        >
                          {option.name}
                          {option.priceDelta > 0 && (
                            <em> +{money.format(option.priceDelta)}</em>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {incomplete && <p className="sb-optgroup-error">Elige una opción.</p>}
              </section>
            );
          })}

          <section className="sb-optgroup">
            <h3>Cantidad</h3>
            <div className="sb-qty">
              <button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity((value) => Math.min(MAX_QTY, value + 1))}>
                +
              </button>
            </div>
          </section>
        </div>

        <div className="sb-customizer-foot">
          <div>
            <span>Total</span>
            <strong>{money.format(unitPrice * quantity)}</strong>
          </div>
          <button className="primary-button" onClick={confirm}>
            {initial.length || initialQuantity > 1 ? "Guardar cambios" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
