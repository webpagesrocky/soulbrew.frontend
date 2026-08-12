import { useEffect, useState } from "react";
import { subscribeUsers } from "../../api/collections";
import { createStaffUser, errorMessage } from "../../api/functions";
import type { Role, User } from "../../types";

const roleLabel: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  EMPLOYEE: "Empleado",
};

export function TeamPanel({ actor }: { actor: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createStaffUser({
        name: String(data.get("name")),
        email: String(data.get("email")),
        password: String(data.get("password")),
        role: data.get("role") as Role,
      });
      form.reset();
      setMessage("Usuario creado correctamente.");
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo crear el usuario"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading">
        <h1>Configuración</h1>
        <p>Administra integrantes del equipo y sus permisos.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
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
        <form className="feature-card" onSubmit={create}>
          <h3>Agregar integrante</h3>
          <label>Nombre</label>
          <input name="name" required minLength={2} />
          <label>Correo</label>
          <input name="email" type="email" required />
          <label>Contraseña temporal</label>
          <input name="password" type="password" minLength={10} required />
          <label>Rol</label>
          <select name="role" required>
            <option value="EMPLOYEE">Empleado</option>
            <option value="SUPERVISOR">Supervisor</option>
            {actor.role === "ADMIN" && <option value="ADMIN">Administrador</option>}
          </select>
          <button className="primary-button" disabled={busy}>
            {busy ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      </div>
    </section>
  );
}
