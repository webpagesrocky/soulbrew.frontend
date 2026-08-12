import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { CashSession } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CashPanel() {
  const [current, setCurrent] = useState<CashSession | null>(null);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  async function load() {
    try {
      const [active, history] = await Promise.all([
        api<{ session: CashSession | null }>("/cash-register/current"),
        api<{ sessions: CashSession[] }>("/cash-register"),
      ]);
      setCurrent(active.session);
      setSessions(history.sessions);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo consultar la caja"); }
  }

  useEffect(() => { void load(); }, []);

  async function open(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/cash-register/open", { method: "POST", body: JSON.stringify({ openingAmount: Number(amount) }) });
      setAmount(""); setSummary(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo abrir la caja"); }
  }

  async function close(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    try {
      const result = await api<{ session: { differenceAmount: number; expectedAmount: number } }>(`/cash-register/${current.id}/close`, {
        method: "POST", body: JSON.stringify({ closingAmount: Number(amount) }),
      });
      setSummary(`Corte cerrado. Esperado: ${money.format(result.session.expectedAmount)} · Diferencia: ${money.format(result.session.differenceAmount)}`);
      setAmount(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cerrar la caja"); }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading"><h1>Cortes de caja</h1><p>Administra turnos, cobros y diferencias de efectivo.</p></div>
      {error && <div className="notice error">{error}</div>}
      {summary && <div className="notice success">{summary}</div>}
      <div className="cash-layout">
        <article className="feature-card dark-card">
          <p className="eyebrow">Caja actual</p>
          {current ? <><h3>Turno abierto</h3><strong className="cash-amount">{money.format(current.opening_amount)}</strong><p>Fondo inicial · abrió {new Date(current.opened_at).toLocaleString("es-MX")}</p></> : <><h3>Comienza tu turno</h3><p>Necesitas una caja abierta para procesar pagos.</p></>}
          <form onSubmit={current ? close : open}>
            <label>{current ? "Efectivo contado al cierre" : "Fondo inicial"}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            <button className="primary-button light-button">{current ? "Cerrar y generar corte" : "Abrir caja"}</button>
          </form>
        </article>
        <article className="feature-card">
          <p className="eyebrow">Historial reciente</p><h3>Últimos cortes</h3>
          <div className="history-list">
            {sessions.map((session) => (
              <div key={session.id}><span><strong>{session.user_name}</strong><small>{new Date(session.opened_at).toLocaleDateString("es-MX")}</small></span><span><b className={`status ${session.status.toLowerCase()}`}>{session.status}</b><small>{session.closing_amount == null ? money.format(session.opening_amount) : money.format(session.closing_amount)}</small></span></div>
            ))}
            {!sessions.length && <p className="muted">Todavía no hay cortes.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
