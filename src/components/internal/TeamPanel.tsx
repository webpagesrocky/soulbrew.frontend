import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Role, User } from "../../types";

interface ListedUser extends User { active: number; created_at: string }
const roleLabel: Record<Role, string> = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", EMPLOYEE: "Empleado" };

export function TeamPanel({ actor }: { actor: User }) {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    try { setUsers((await api<{ users: ListedUser[] }>("/users")).users); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cargar el equipo"); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/users", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
      event.currentTarget.reset(); setMessage("Usuario creado correctamente."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el usuario"); }
  }

  return (
    <section className="reference-panel">
      <div className="reference-heading"><h1>Configuración</h1><p>Administra integrantes del equipo y sus permisos.</p></div>
      {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
      <div className="management-layout">
        <div className="table-card"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th></tr></thead><tbody>{users.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{roleLabel[member.role]}</td><td><span className="status open">{member.active ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody></table></div>
        <form className="feature-card" onSubmit={create}><h3>Agregar integrante</h3><label>Nombre</label><input name="name" required minLength={2}/><label>Correo</label><input name="email" type="email" required/><label>Contraseña temporal</label><input name="password" type="password" minLength={10} required/><label>Rol</label><select name="role" required><option value="EMPLOYEE">Empleado</option><option value="SUPERVISOR">Supervisor</option>{actor.role === "ADMIN" && <option value="ADMIN">Administrador</option>}</select><button className="primary-button">Crear usuario</button></form>
      </div>
    </section>
  );
}
