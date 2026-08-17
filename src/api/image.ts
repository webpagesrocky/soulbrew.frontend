/**
 * Compresión de imágenes en el navegador.
 *
 * Cloud Storage exige plan Blaze, así que la foto del producto se guarda como
 * data URI dentro del propio documento de Firestore. El límite duro es 1 MiB
 * por documento; comprimir a ~500 px de lado y JPEG de calidad media deja cada
 * imagen en unas decenas de KB, muy por debajo del tope que imponen las reglas
 * (200 000 caracteres).
 */

/** Tope que aceptan las reglas de Firestore para `imageUrl`. */
export const MAX_IMAGE_CHARS = 200_000;

const MAX_SIDE = 500;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export class ImageError extends Error {}

function scaledSize(width: number, height: number) {
  const largest = Math.max(width, height);
  if (largest <= MAX_SIDE) return { width, height };
  const ratio = MAX_SIDE / largest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Safari viejo: createImageBitmap no siempre acepta un File.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ImageError("No se pudo leer la imagen"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError("El archivo no es una imagen");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageError("La imagen es demasiado grande (máximo 15 MB)");
  }

  const source = await decode(file);
  const { width, height } = scaledSize(source.width, source.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("Tu navegador no permite procesar la imagen");
  context.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  // Se baja la calidad por pasos hasta entrar en el presupuesto: una foto con
  // mucho detalle puede no caber a la primera.
  for (const quality of [0.72, 0.6, 0.5, 0.4]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
  }

  throw new ImageError("No se pudo comprimir la imagen lo suficiente. Prueba con una más simple.");
}

/** Peso aproximado en KB de un data URI, para mostrarlo en la interfaz. */
export function approximateKb(dataUrl: string): number {
  return Math.round((dataUrl.length * 3) / 4 / 1024);
}
