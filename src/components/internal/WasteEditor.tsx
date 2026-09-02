import { useState } from "react";
import type { Supply } from "../../types";

export interface WasteLine {
  supplyId: string;
  quantity: number;
  reason: string;
}

interface Props {
  supplies: Supply[];
  lines: WasteLine[];
  onChange: (lines: WasteLine[]) => void;
}

/**
 * Captura de merma del turno: lo que se tiró, derramó o se dio de muestra.
 *
 * Va sobre insumos, no sobre bebidas: lo que de verdad se pierde es la leche
 * derramada o el vaso roto. Se captura al cerrar caja, que es el momento en
 * que se cuadra el turno, y no duplica el descuento de las ventas — ésas ya
 * bajaron su receta al cobrarse.
 */
export function WasteEditor({ supplies, lines, onChange }: Props) {
  const [supplyId, setSupplyId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const supplyOf = (id: string) => supplies.find((supply) => supply.id === id);

  function add() {
    const amount = Number(quantity);
    if (!supplyId || !Number.isFinite(amount) || amount <= 0 || reason.trim().length < 4) return;
    onChange([...lines, { supplyId, quantity: amount, reason: reason.trim() }]);
    setSupplyId("");
    setQuantity("");
    setReason("");
  }

  const canAdd = supplyId && Number(quantity) > 0 && reason.trim().length >= 4;
  const selected = supplyOf(supplyId);

  return (
    <div className="waste-editor">
      <p className="eyebrow">Merma del turno (opcional)</p>

      {lines.length > 0 && (
        <div className="waste-list">
          {lines.map((line, index) => {
            const supply = supplyOf(line.supplyId);
            return (
              <div className="waste-row" key={`${line.supplyId}-${index}`}>
                <span>
                  <strong>
                    {line.quantity} {supply?.unit ?? ""} de {supply?.name ?? line.supplyId}
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
            );
          })}
        </div>
      )}

      <select value={supplyId} onChange={(event) => setSupplyId(event.target.value)}>
        <option value="">Insumo…</option>
        {supplies.map((supply) => (
          <option value={supply.id} key={supply.id}>
            {supply.name} · {supply.stock} {supply.unit}
          </option>
        ))}
      </select>
      <div className="waste-add">
        <input
          type="number"
          min="0.01"
          step="0.01"
          placeholder={selected ? `Cant. (${selected.unit})` : "Cant."}
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
        Se descuenta de los insumos al cerrar el turno y queda registrado en la bitácora.
      </small>
    </div>
  );
}
