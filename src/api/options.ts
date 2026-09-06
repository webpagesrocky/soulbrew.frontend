import type { OptionGroup, Product } from "../types";

/**
 * Qué puede personalizar un producto.
 *
 * Manda lo que tenga asignado el producto; si no tiene nada propio, hereda los
 * grupos de su categoría. Es la misma resolución que usan las recetas, y es lo
 * que permite decir "el cold foam va en Matcha, Café y Chai" una sola vez en
 * lugar de marcarlo producto por producto.
 */
export function resolveOptionGroups(product: Product, groups: OptionGroup[]): OptionGroup[] {
  const active = groups.filter((group) => group.active);

  if (product.optionGroups.length > 0) {
    // El orden lo pone el panel, no el orden en que se marcaron.
    return product.optionGroups
      .map((assigned) => {
        const group = active.find((item) => item.id === assigned.groupId);
        if (!group) return null;
        const options = group.options.filter(
          (option) =>
            option.active &&
            (assigned.optionIds.length === 0 || assigned.optionIds.includes(option.id)),
        );
        return options.length ? { ...group, options } : null;
      })
      .filter((group): group is OptionGroup => group !== null)
      .sort((a, b) => a.order - b.order);
  }

  return active
    .filter(
      (group) => group.categoryIds.length === 0 || group.categoryIds.includes(product.category),
    )
    .map((group) => ({ ...group, options: group.options.filter((option) => option.active) }))
    .filter((group) => group.options.length > 0)
    .sort((a, b) => a.order - b.order);
}
