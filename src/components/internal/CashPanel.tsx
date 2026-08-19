import { useEffect, useMemo, useState } from "react";
import { deleteCashSession, subscribeCashSessions, subscribeProducts } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import { closeCashSession, openCashSession, registerWaste } from "../../api/transactions";
import type { CashSession, CashTotals, Product, User } from "../../types";
import { WasteEditor, type WasteLine } from "./WasteEditor";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

interface ClosingReport {
  userName: string;
  openedAt: Date | null;
  closedAt: Date;
  openingAmount: number;
  closingAmount: number;
  expectedAmount: number;
  differenceAmount: number;
  totals: CashTotals;
  waste: Array<{ name: string; quantity: number; reason: string }>;
}

export function CashPanel({ user }: { user: User }) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ClosingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [waste, setWaste] = useState<WasteLine[]>([]);

  useEffect(
    () =>
      subscribeProducts(
        setProducts,
        (reason) => setError(errorMessage(reason, "No se pudo cargar el inventario")),
      ),
    [],
  );

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
        // La merma se aplica ANTES de cerrar: una vez cerrado el turno ya no
        // se puede tocar, y así el inventario final del corte ya la refleja.
        for (const line of waste) {
          await registerWaste(line.productId, line.quantity, line.reason, {
            uid: user.id,
            name: user.name,
          });
        }

        const result = await closeCashSession(current.id, Number(amount));
        setReport({
          userName: current.userName,
          openedAt: current.openedAt,
          closedAt: new Date(),
          openingAmount: result.openingAmount,
          closingAmount: result.closingAmount,
          expectedAmount: result.expectedAmount,
          differenceAmount: result.differenceAmount,
          totals: result.totals,
          waste: waste.map((line) => ({
            name: products.find((product) => product.id === line.productId)?.name ?? line.productId,
            quantity: line.quantity,
            reason: line.reason,
          })),
        });
        setWaste([]);
      } else {
        await openCashSession(Number(amount), { uid: user.id, name: user.name });
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

  async function removeSession(session: CashSession) {
    const confirmed = window.confirm(
      `¿Borrar el corte de ${session.userName} del ` +
        `${session.openedAt ? session.openedAt.toLocaleDateString("es-MX") : "—"}?\n\n` +
        "Desaparece del historial y del reporte semanal. Las ventas de ese turno " +
        "se conservan, pero quedan sin corte asociado y ya no se podrán cancelar.",
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteCashSession(session.id);
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo borrar el corte"));
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
            {current && (
              <WasteEditor products={products} lines={waste} onChange={setWaste} />
            )}
            <button className="primary-button light-button" disabled={busy}>
              {busy
                ? "Procesando…"
                : current
                  ? "Cerrar y generar corte"
                  : "Abrir caja"}
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
                {user.role === "ADMIN" && session.status === "CLOSED" && (
                  <button
                    className="row-delete"
                    disabled={busy}
                    onClick={() => void removeSession(session)}
                    aria-label={`Borrar corte de ${session.userName}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!sessions.length && <p className="muted">Todavía no hay cortes.</p>}
          </div>
        </article>
      </div>

      {report && (
        <div className="cash-report-backdrop" onClick={() => setReport(null)}>
          <div className="cash-report" onClick={(event) => event.stopPropagation()}>
            <div className="cash-report-head">
              <p className="eyebrow">Reporte de cierre</p>
              <h2>Corte de caja</h2>
              <p>
                {report.userName} · abrió{" "}
                {report.openedAt ? report.openedAt.toLocaleString("es-MX") : "—"}
                <br />
                cerró {report.closedAt.toLocaleString("es-MX")}
              </p>
            </div>

            <p className="cash-report-section">Cajón de efectivo</p>
            <div className="cash-report-row"><span>Fondo inicial</span><span>{money.format(report.openingAmount)}</span></div>
            <div className="cash-report-row"><span>Cobros en efectivo</span><span>{money.format(report.totals.cashTotal)}</span></div>
            <div className="cash-report-row"><span>Efectivo esperado</span><span>{money.format(report.expectedAmount)}</span></div>
            <div className="cash-report-row"><span>Efectivo contado</span><span>{money.format(report.closingAmount)}</span></div>
            <div className={`cash-report-row cash-report-diff ${report.differenceAmount === 0 ? "zero" : report.differenceAmount > 0 ? "positive" : "negative"}`}>
              <span>Descuadre</span>
              <span>
                {report.differenceAmount > 0 ? "+" : ""}
                {money.format(report.differenceAmount)}
              </span>
            </div>

            <p className="cash-report-section">Resumen de ventas</p>
            <div className="cash-report-row"><span>Ventas ({report.totals.saleCount})</span><span>{money.format(report.totals.salesTotal)}</span></div>
            <div className="cash-report-row"><span>Efectivo</span><span>{money.format(report.totals.cashTotal)}</span></div>
            <div className="cash-report-row"><span>Tarjeta</span><span>{money.format(report.totals.cardTotal)}</span></div>
            <div className="cash-report-row"><span>Transferencia</span><span>{money.format(report.totals.transferTotal)}</span></div>

            {report.waste.length > 0 && (
              <>
                <p className="cash-report-section">Merma registrada</p>
                {report.waste.map((line, index) => (
                  <div className="cash-report-row" key={`${line.name}-${index}`}>
                    <span>
                      {line.quantity} × {line.name}
                      <small> · {line.reason}</small>
                    </span>
                    <span>—</span>
                  </div>
                ))}
              </>
            )}

            <div className="cash-report-actions">
              <button className="reference-primary" onClick={() => window.print()}>Imprimir</button>
              <button onClick={() => setReport(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
