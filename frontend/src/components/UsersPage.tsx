import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { createUser, getApiError, getUsers } from "../api";
import { useAuth } from "../auth";
import type { User, UserRole } from "../types";

export default function UsersPage() {
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("driver");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "admin") { setLoading(false); return; }
    setLoading(true);
    try { setUsers(await getUsers()); setError(null); }
    catch (cause) { setError(getApiError(cause, "Could not load users.")); }
    finally { setLoading(false); }
  }, [user?.role]);
  useEffect(() => { void load(); }, [load]);

  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createUser({ name, email, password, role });
      setUsers((current) => [...current, created]);
      setName(""); setEmail(""); setPassword(""); setRole("driver");
      setNotice(`${created.name} added as ${created.role}.`);
    } catch (cause) { setError(getApiError(cause, "Could not create this account.")); }
    finally { setBusy(false); }
  };

  return (
    <main className="container">
      <header className="page-header"><div><p className="eyebrow">SMART WASTE · KIGALI</p><h1>User management</h1><p className="subtitle">Manage system accounts and their access roles.</p></div>
        <div className="header-actions"><span className="role-pill">admin</span><Link className="nav-link" to="/dashboard">Dashboard</Link><Link className="nav-link" to="/pickup-requests">Requests</Link><button onClick={() => void load()} disabled={loading}>Refresh</button><button onClick={signOut}>Sign out</button></div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <section className="user-create-panel"><div><p className="eyebrow">NEW ACCOUNT</p><h2>Add a user</h2><p className="subtitle">Choose the role that matches their responsibilities.</p></div>
        <form className="request-form" onSubmit={submit}>
          <label>Full name<input required minLength={1} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <div className="request-form-row"><label>Temporary password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="resident">Resident</option><option value="driver">Driver</option><option value="admin">Admin</option></select></label></div>
          <p className="field-hint">Share the temporary password securely with the new user.</p>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add account"}</button>
        </form>
      </section>
      <section className="users-section"><div className="section-heading"><div><h2>System users</h2><p>{users.length} accounts</p></div></div>
        {loading ? <p>Loading users…</p> : users.length === 0 ? <p className="empty-state">No user accounts found.</p> : <div className="user-list">{users.map((item) => <article className="user-row" key={item.id}><div className="user-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</div><div className="user-info"><strong>{item.name}</strong><span>{item.email}</span></div><span className={`role-pill ${item.role}`}>{item.role}</span><span className={`user-state ${item.is_active ? "active" : "inactive"}`}>{item.is_active ? "Active" : "Disabled"}</span></article>)}</div>}
      </section>
    </main>
  );
}
