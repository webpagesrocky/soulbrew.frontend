import { useEffect, useState } from "react";
import { subscribeUsers } from "../../api/collections";
import { errorMessage } from "../../api/errors";
import type { Role, User } from "../../types";

const roleLabel: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  EMPLOYEE: "Empleado",
};

export function TeamPanel({ actor: _actor }: { actor: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeUsers(
        (rows) => {
          setUsers(rows);
          setError("");
        },
        (reason) => setError(errorMessage(reason, "No se pudo cargar el equipo")),
      ),
    [],
  );

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Configuración</h1>
        <p>Integrantes del equipo y sus permisos.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="management-layout">
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <small>{member.email}</small>
                  </td>
                  <td>{roleLabel[member.role]}</td>
                  <td>
                    <span className="status open">{member.active ? "Activo" : "Inactivo"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <article className="feature-card">
          <h3>Agregar integrante</h3>
          <p className="muted">
            Asignar un rol requiere una credencial que el navegador nunca debe tener, así que
            esto ya no se hace desde aquí. Pide a quien administre el proyecto de Firebase que
            corra, desde una terminal:
          </p>
          <p>
            <code>npm run create-staff -- --name "Nombre" --email correo@soulbrew.com --role EMPLOYEE</code>
          </p>
          <p className="muted">La nueva persona aparecerá en esta lista en cuanto se cree.</p>
        </article>
      </div>
    </section>
  );
}
