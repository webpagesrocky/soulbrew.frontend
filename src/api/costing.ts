import type { Category, Product, RecipeItem, Supply } from "../types";

/**
 * Costo real de lo que se vende, calculado desde los insumos.
 *
 * La idea: el inventario del negocio son los insumos (leche, vasos, matcha en
 * polvo), no las bebidas. Una bebida no se compra ni se almacena — se arma. Por
 * eso su costo no se teclea, se deduce de su receta y del precio al que se
 * compra cada insumo.
 */

/** Costo de una unidad de uso (1 ml, 1 g) según la presentación de compra. */
export function unitCost(supply: Supply): number {
  if (supply.packSize > 0) return supply.packCost / supply.packSize;
  // Insumos dados de alta antes de las presentaciones: conservan su costo por
  // unidad capturado a mano.
  return supply.cost;
}

/**
 * Receta que aplica a un producto: la suya propia si la tiene, y si no la de
 * su categoría. Vacía significa que todavía nadie la capturó.
 */
export function effectiveRecipe(product: Product, categories: Category[]): RecipeItem[] {
  if (product.recipe.length > 0) return product.recipe;
  return categories.find((category) => category.id === product.category)?.recipe ?? [];
}

/** De dónde salió el costo, para poder decírselo a quien lo está viendo. */
export type CostSource = "PRODUCT_RECIPE" | "CATEGORY_RECIPE" | "MANUAL" | "NONE";

export interface ProductCost {
  value: number;
  source: CostSource;
  /** Ingredientes cuyo insumo ya no existe: su costo no se pudo contar. */
  missingSupplies: string[];
}

/**
 * Costo de preparar una unidad del producto.
 *
 * Manda la receta. El costo capturado a mano queda de respaldo mientras no
 * haya receta, para que los reportes no se vayan a cero mientras se terminan
 * de capturar todas.
 */
export function productCost(
  product: Product,
  categories: Category[],
  supplies: Supply[],
): ProductCost {
  const recipe = effectiveRecipe(product, categories);
  if (!recipe.length) {
    return {
      value: product.cost ?? 0,
      source: product.cost ? "MANUAL" : "NONE",
      missingSupplies: [],
    };
  }

  const byId = new Map(supplies.map((supply) => [supply.id, supply]));
  const missingSupplies: string[] = [];
  let value = 0;
  for (const ingredient of recipe) {
    const supply = byId.get(ingredient.supplyId);
    if (!supply) {
      missingSupplies.push(ingredient.supplyName);
      continue;
    }
    value += unitCost(supply) * ingredient.quantity;
  }

  return {
    value: Math.round(value * 100) / 100,
    source: product.recipe.length > 0 ? "PRODUCT_RECIPE" : "CATEGORY_RECIPE",
    missingSupplies,
  };
}

/**
 * Tabla de costos lista para consultar por id, que es como la necesitan los
 * reportes: recorren renglones de órdenes viejas, no productos.
 */
export function costTable(
  products: Product[],
  categories: Category[],
  supplies: Supply[],
): Map<string, number> {
  return new Map(
    products.map((product) => [product.id, productCost(product, categories, supplies).value]),
  );
}
