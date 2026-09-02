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
          <LoyaltyCard name={customer.name} visits={customer.visits} rewardEligible={false} />
        )}
        <Link to="/" className="sb-btn sb-btn-outline loyalty-page-back">
          Ver el menú
        </Link>
      </div>
    </div>
  );
}
