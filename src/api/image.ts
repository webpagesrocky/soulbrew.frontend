/**
 * Recorte y compresión de imágenes en el navegador.
 *
 * Cloud Storage exige plan Blaze, así que la foto del producto se guarda como
 * data URI dentro del propio documento de Firestore. El límite duro es 1 MiB
 * por documento; el recorte sale a 600×400 y en JPEG de calidad media queda en
 * unas decenas de KB, muy por debajo del tope que imponen las reglas.
 */

/** Tope que aceptan las reglas de Firestore para `imageUrl`. */
export const MAX_IMAGE_CHARS = 200_000;

/**
 * Proporción del recuadro de la foto en la tarjeta del menú. El ajustador usa
 * exactamente esta misma proporción para que lo que se encuadra sea lo que se
 * ve después: sin sorpresas de recorte.
 */
export const IMAGE_ASPECT = 3 / 2;
const OUTPUT_WIDTH = 600;
const OUTPUT_HEIGHT = Math.round(OUTPUT_WIDTH / IMAGE_ASPECT);

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export class ImageError extends Error {}

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Baja la calidad por pasos hasta que el data URI entra en el presupuesto. */
function encodeWithinBudget(canvas: HTMLCanvasElement): string {
  for (const quality of [0.72, 0.6, 0.5, 0.4, 0.32]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
  }
  throw new ImageError("No se pudo comprimir la imagen lo suficiente. Prueba con otra.");
}

/**
 * Recorta la región elegida en el ajustador y la deja ya encuadrada.
 *
 * El recorte se hornea en la imagen guardada en vez de guardarse como
 * coordenadas: así el menú público sólo pinta un `<img>` y no necesita saber
 * nada del encuadre.
 */
export function cropToDataUrl(source: CanvasImageSource, rect: SourceRect): string {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("Tu navegador no permite procesar la imagen");

  context.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  return encodeWithinBudget(canvas);
}

/**
 * Carga un archivo (o un data URI ya guardado) como elemento de imagen listo
 * para medir y recortar. Quien lo llama se encarga de liberar `src` si vino
 * de un File.
 */
export async function loadImage(source: File | string): Promise<HTMLImageElement> {
  if (source instanceof File) {
    if (!source.type.startsWith("image/")) throw new ImageError("El archivo no es una imagen");
    if (source.size > MAX_INPUT_BYTES) {
      throw new ImageError("La imagen es demasiado grande (máximo 15 MB)");
    }
  }

  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ImageError("No se pudo leer la imagen"));
      image.src = url;
    });
  } catch (error) {
    if (typeof source !== "string") URL.revokeObjectURL(url);
    throw error;
  }
}

/** Peso aproximado en KB de un data URI, para mostrarlo en la interfaz. */
export function approximateKb(dataUrl: string): number {
  return Math.round((dataUrl.length * 3) / 4 / 1024);
}
