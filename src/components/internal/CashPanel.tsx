import { useEffect, useMemo, useState } from "react";
import { subscribeCashSessions } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import {
  closeCashSession,
  openCashSession,
  updateOpeningAmount,
} from "../../api/transactions";
import type { CashSession, CashTotals, User } from "../../types";

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
}

export function CashPanel({ user }: { user: User }) {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ClosingReport | null>(null);
  const [busy, setBusy] = useState(false);
  // El historial se abre sólo si lo piden: en el día a día estorba y lo que
  // importa es la caja de hoy, no los cortes de la semana pasada.
  const [showHistory, setShowHistory] = useState(false);


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
        setReport({
          userName: current.userName,
          openedAt: current.openedAt,
          closedAt: new Date(),
          openingAmount: result.openingAmount,
          closingAmount: result.closingAmount,
          expectedAmount: result.expectedAmount,
          differenceAmount: result.differenceAmount,
          totals: result.totals,
        });
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

  /**
   * Vuelve a abrir el recibo de un corte ya cerrado, por si lo cerraron sin
   * imprimirlo. La merma no se guarda en el corte, así que esa parte sale
   * vacía: sólo aparece en el recibo del momento del cierre.
   */
  function showReceipt(session: CashSession) {
    if (
      session.closedAt == null ||
      session.closingAmount == null ||
      session.expectedAmount == null ||
      session.differenceAmount == null ||
      session.totals == null
    ) {
      return setError("Ese corte es viejo y no guardó el detalle del recibo.");
    }
    setReport({
      userName: session.userName,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingAmount: session.openingAmount,
      closingAmount: session.closingAmount,
      expectedAmount: session.expectedAmount,
      differenceAmount: session.differenceAmount,
      totals: session.totals,
    });
  }

  /**
   * Corrige el fondo inicial del turno abierto.
   *
   * Reemplaza al botón de borrar. Un corte borrado dejaba sus ventas sin corte
   * y el historial sin forma de cuadrar; si el fondo se teclea mal, lo que hay
   * que hacer es corregirlo, no desaparecer el turno. Mientras el corte sigue
   * abierto no hay ninguna cifra calculada todavía, así que corregirlo aquí no
   * desacomoda nada: cerrará con el número bueno.
   */
  async function editarCorteActual(session: CashSession) {
    const escrito = window.prompt(
      "¿Con cuánto se abrió la caja de verdad?\n\n" +
        `Ahora dice ${money.format(session.openingAmount)}. Corrígelo si se tecleó mal: ` +
        "el turno sigue abierto, así que el efectivo esperado y el descuadre se " +
        "calcularán con el número que dejes aquí.",
      String(session.openingAmount),
    );
    if (escrito === null) return;

    // Aquí se escribe con coma decimal tan seguido como con punto.
    const monto = Number(escrito.trim().replace(",", "."));
    if (!Number.isFinite(monto) || monto < 0) {
      return setError("Escribe el fondo inicial como número, de 0 para arriba.");
    }
    if (monto === session.openingAmount) return;

    setBusy(true);
    setError("");
    try {
      await updateOpeningAmount(session.id, monto);
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo corregir el corte"));
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
              <button
                type="button"
                className="session-edit"
                disabled={busy}
                onClick={() => void editarCorteActual(current)}
              >
                Editar corte actual
              </button>
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
            {/* Sin esta aclaración es fácil contar sólo lo vendido y sacar el
                fondo aparte, y entonces el descuadre sale en falso. */}
            {current && (
              <small className="cash-hint">
                Cuenta todo el cajón, incluido el fondo con el que abriste.
              </small>
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
          <button
            type="button"
            className="history-toggle"
            onClick={() => setShowHistory((open) => !open)}
            aria-expanded={showHistory}
          >
            <span>
              <p className="eyebrow">Historial reciente</p>
              <h3>Últimos cortes ({sessions.length})</h3>
            </span>
            <span className={`history-chevron ${showHistory ? "open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
          {showHistory && (
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
                  {session.status === "CLOSED" && (
                    <button
                      className="session-receipt"
                      onClick={() => showReceipt(session)}
                      aria-label={`Ver recibo del corte de ${session.userName}`}
                    >
                      Ver recibo
                    </button>
                  )}
                </div>
              ))}
              {!sessions.length && <p className="muted">Todavía no hay cortes.</p>}
            </div>
          )}
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
