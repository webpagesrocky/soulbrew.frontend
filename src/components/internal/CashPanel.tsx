import { useEffect, useMemo, useState } from "react";
import { subscribeCashSessions } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { closeCashSession, openCashSession } from "../../api/transactions";
import type { CashSession, User } from "../../types";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CashPanel({ user }: { user: User }) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeCashSessions(
        // Un empleado sólo tiene permiso sobre sus propios cortes.
        user.role === "EMPLOYEE" ? user.id : undefined,
        (rows) => {
          setSessions(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudo consultar la caja")),
      ),
    [user.id, user.role],
  );

  const current = useMemo(
    () => sessions.find((session) => session.status === "OPEN" && session.userId === user.id) ?? null,
    [sessions, user.id],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (current) {
        const result = await closeCashSession(current.id, Number(amount));
        setSummary(
          `Corte cerrado. Esperado: ${money.format(result.expectedAmount)} · Diferencia: ${money.format(result.differenceAmount)}`,
        );
      } else {
        await openCashSession(Number(amount), { uid: user.id, name: user.name });
        setSummary("");
      }
      setAmount("");
    } catch (reason) {
      setError(
        errorMessage(reason, current ? "No se pudo cerrar la caja" : "No se pudo abrir la caja"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Cortes de caja</h1>
        <p>Administra turnos, cobros y diferencias de efectivo.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      {summary && <div className="notice success">{summary}</div>}
      <div className="cash-layout">
        <article className="feature-card dark-card">
          <p className="eyebrow">Caja actual</p>
          {current ? (
            <>
              <h3>Turno abierto</h3>
              <strong className="cash-amount">{money.format(current.openingAmount)}</strong>
              <p>
                Fondo inicial · abrió{" "}
                {current.openedAt ? current.openedAt.toLocaleString("es-MX") : "hace un momento"}
              </p>
            </>
          ) : (
            <>
              <h3>Comienza tu turno</h3>
              <p>Necesitas una caja abierta para procesar pagos.</p>
            </>
          )}
          <form onSubmit={submit}>
            <label>{current ? "Efectivo contado al cierre" : "Fondo inicial"}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
            <button className="primary-button light-button" disabled={busy}>
              {current ? "Cerrar y generar corte" : "Abrir caja"}
            </button>
          </form>
        </article>
        <article className="feature-card">
          <p className="eyebrow">Historial reciente</p>
          <h3>Últimos cortes</h3>
          <div className="history-list">
            {sessions.map((session) => (
              <div key={session.id}>
                <span>
                  <strong>{session.userName}</strong>
                  <small>
                    {session.openedAt ? session.openedAt.toLocaleDateString("es-MX") : "—"}
                  </small>
                </span>
                <span>
                  <b className={`status ${session.status.toLowerCase()}`}>{session.status}</b>
                  <small>
                    {session.closingAmount == null
                      ? money.format(session.openingAmount)
                      : money.format(session.closingAmount)}
                  </small>
                </span>
              </div>
            ))}
            {!sessions.length && <p className="muted">Todavía no hay cortes.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
