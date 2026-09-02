import { Icon } from "./Icon";

interface Props {
  name: string;
  /** Tazas llenas, 0-10. En 10 el pedido que se acaba de hacer sale gratis. */
  visits: number;
  rewardEligible: boolean;
}

/**
 * Tarjeta de puntos Soul Brew: aparece justo después de ordenar (si dieron
 * teléfono) y también vive en /tarjeta/:telefono.
 */
export function LoyaltyCard({ name, visits, rewardEligible }: Props) {
  const filled = Math.min(Math.max(visits, 0), 10);
  const remaining = 10 - filled;

  return (
    <div className="loyalty-card">
      <div className="loyalty-icon">
        <Icon name="coffee" size={22} />
      </div>
      <h3>Hola, {name}</h3>
      <p className="loyalty-sub">Tu tarjeta Soul Brew</p>
      <div className="loyalty-cups">
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} className={index < filled ? "loyalty-cup filled" : "loyalty-cup"}>
            {index < filled && <Icon name="coffee" size={16} />}
          </span>
        ))}
      </div>
      <p className="loyalty-count">Llevas {filled} de 10</p>
      <p className="loyalty-hint">
        {rewardEligible
          ? "¡Este café es gratis! 🎉"
          : remaining === 10
            ? "Te faltan 10 para tu café gratis"
            : `Te faltan ${remaining} para tu café gratis`}
      </p>
    </div>
  );
}
