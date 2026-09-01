import { Icon } from "./Icon";

interface Props {
  name: string;
  phone: string;
  /** Tazas llenas, 0-10. En 10 el pedido que se acaba de hacer sale gratis. */
  visits: number;
  rewardEligible: boolean;
}

/**
 * Tarjeta de puntos Soul Brew: aparece justo después de ordenar (si dieron
 * teléfono) y también vive en /tarjeta/:telefono como enlace guardable.
 */
export function LoyaltyCard({ name, phone, visits, rewardEligible }: Props) {
  const filled = Math.min(Math.max(visits, 0), 10);
  const remaining = 10 - filled;

  async function save() {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}tarjeta/${phone}`;
    const shareData = { title: "Mi tarjeta Soul Brew", text: "Así voy en mis visitas a Soul Brew", url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Cancelado por el usuario: cae al respaldo de copiar el enlace.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert(`Enlace copiado. Guárdalo para ver tu tarjeta cuando quieras:\n${url}`);
    } catch {
      window.alert(`Guarda este enlace para ver tu tarjeta cuando quieras:\n${url}`);
    }
  }

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
      <button type="button" className="loyalty-save" onClick={() => void save()}>
        Guarda esta tarjeta en tu celular
      </button>
    </div>
  );
}
