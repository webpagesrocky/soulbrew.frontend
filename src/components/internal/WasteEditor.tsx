import { useState } from "react";
import type { Product } from "../../types";

export interface WasteLine {
  productId: string;
  quantity: number;
  reason: string;
}

interface Props {
  products: Product[];
  lines: WasteLine[];
  onChange: (lines: WasteLine[]) => void;
}

/**
 * Captura de merma del turno: lo que se tiró, derramó o se dio de muestra.
 *
 * Va dentro del cierre de caja porque es el momento en que se cuadra el turno.
 * No duplica el descuento de las ventas —esas ya restaron inventario al
 * cobrarse—; esto registra lo que se perdió sin venderse.
 */
export function WasteEditor({ products, lines, onChange }: Props) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const nameOf = (id: string) => products.find((product) => product.id === id)?.name ?? id;

  function add() {
    const amount = Number(quantity);
    if (!productId || !Number.isFinite(amount) || amount <= 0 || reason.trim().length < 4) return;
    onChange([...lines, { productId, quantity: amount, reason: reason.trim() }]);
    setProductId("");
    setQuantity("");
    setReason("");
  }

  const canAdd = productId && Number(quantity) > 0 && reason.trim().length >= 4;

  return (
    <div className="waste-editor">
      <p className="eyebrow">Merma del turno (opcional)</p>

      {lines.length > 0 && (
        <div className="waste-list">
          {lines.map((line, index) => (
            <div className="waste-row" key={`${line.productId}-${index}`}>
              <span>
                <strong>
                  {line.quantity} × {nameOf(line.productId)}
                </strong>
                <small>{line.reason}</small>
              </span>
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
                aria-label="Quitar merma"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <select value={productId} onChange={(event) => setProductId(event.target.value)}>
        <option value="">Producto…</option>
        {products.map((product) => (
          <option value={product.id} key={product.id}>
            {product.name} · {product.stock} uds
          </option>
        ))}
      </select>
      <div className="waste-add">
        <input
          type="number"
          min="1"
          step="1"
          placeholder="Cant."
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <input
          placeholder="Motivo (se derramó, muestra…)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button type="button" onClick={add} disabled={!canAdd}>
          Añadir
        </button>
      </div>
      <small className="waste-note">
        Se descuenta del inventario al cerrar el turno y queda registrado en la bitácora.
      </small>
    </div>
  );
}
