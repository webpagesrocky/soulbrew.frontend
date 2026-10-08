import { useState } from "react";

/**
 * Guardar la tarjeta de puntos en el celular.
 *
 * Lo que se guarda es la dirección de la tarjeta, no una foto: esa página lee
 * las visitas en vivo, así que el enlace guardado nunca se queda viejo.
 *
 * Vive aparte porque aparece en dos momentos distintos: justo después de
 * ordenar, que es cuando la persona tiene la tarjeta enfrente y es el mejor
 * momento para que se la lleve, y en la propia página de la tarjeta.
 */
export function SaveCardButton({ phone }: { phone: string }) {
  const [saved, setSaved] = useState("");

  if (!phone) return null;

  // Se arma con BASE_URL porque en GitHub Pages el sitio cuelga de una
  // subcarpeta: construir "/tarjeta/..." a pelo daría un enlace roto.
  const url = new URL(`${import.meta.env.BASE_URL}tarjeta/${phone}`, window.location.origin).href;

  /**
   * En celular abre el menú de compartir del sistema, que es por donde la
   * gente guarda cosas (mandárselo por WhatsApp, notas, marcadores). En
   * escritorio, donde ese menú no existe, copia el enlace.
   */
  async function save() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mi tarjeta de Soul Brew", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSaved("Enlace copiado. Guárdalo donde lo vuelvas a encontrar.");
    } catch {
      // Si cierran el menú de compartir no es un error: se calla.
      setSaved("");
    }
  }

  return (
    <div className="loyalty-save">
      <button type="button" className="primary-button" onClick={() => void save()}>
        Guardar mi tarjeta
      </button>
      {saved && <p className="loyalty-saved">{saved}</p>}
      <small>
        También puedes añadir esa página a la pantalla de inicio de tu celular desde el menú de tu
        navegador: queda como una app y abre tu tarjeta de un toque.
      </small>
    </div>
  );
}
