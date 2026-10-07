import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { subscribeCustomer } from "../api/collections";
import { errorMessage } from "../api/errors";
import { LoyaltyCard } from "../components/LoyaltyCard";
import type { Customer } from "../types";

/**
 * Página que abre el enlace guardado desde la tarjeta de puntos: consulta en
 * vivo cuántas visitas lleva ese teléfono, sin necesitar volver a ordenar.
 */
export function CustomerCardView() {
  const { phone = "" } = useParams();
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  /**
   * En celular abre el menú de compartir del sistema, que es por donde la
   * gente guarda cosas (WhatsApp a uno mismo, notas, marcadores). En
   * escritorio, donde ese menú no existe, copia el enlace.
   */
  async function saveCard() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mi tarjeta de Soul Brew", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSaved("Enlace copiado. Guárdalo donde lo vuelvas a encontrar.");
    } catch {
      // Si la persona cierra el menú de compartir no es un error: se calla.
      setSaved("");
    }
  }

  useEffect(
    () =>
      subscribeCustomer(
        phone,
        setCustomer,
        (reason) => setError(errorMessage(reason, "No pudimos cargar tu tarjeta")),
      ),
    [phone],
  );

  return (
    <div className="sb-page loyalty-page">
      <header className="sb-header">
        <span className="sb-logo">Soul Brew</span>
      </header>
      <div className="loyalty-page-body">
        {error && <div className="notice error sb-notice">{error}</div>}
        {customer === undefined && !error && <p className="sb-loading">Cargando tu tarjeta…</p>}
        {customer === null && !error && (
          <p className="sb-empty">
            Todavía no hay compras registradas con este número. Se crea sola en tu primer pedido.
          </p>
        )}
        {customer && (
          <>
            <LoyaltyCard name={customer.name} visits={customer.visits} rewardEligible={false} />
            {/* Guardar la tarjeta es guardar ESTA dirección: la página lee las
                visitas en vivo, así que el enlace nunca se queda viejo. */}
            <div className="loyalty-save">
              <button type="button" className="primary-button" onClick={() => void saveCard()}>
                Guardar mi tarjeta
              </button>
              {saved && <p className="loyalty-saved">{saved}</p>}
              <small>
                También puedes añadir esta página a la pantalla de inicio de tu celular desde el
                menú de tu navegador: queda como una app y abre tu tarjeta de un toque.
              </small>
            </div>
          </>
        )}
        <Link to="/" className="sb-btn sb-btn-outline loyalty-page-back">
          Ver el menú
        </Link>
      </div>
    </div>
  );
}
