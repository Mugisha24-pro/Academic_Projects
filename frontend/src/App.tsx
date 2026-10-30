import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { assignRoute, approveRoute, collectRouteStop, createRoute, getApiError, getBins, getDrivers, getRoutes, register } from "./api";
import { AuthProvider, useAuth } from "./auth";
import DashboardPage from "./components/DashboardPage";
import PickupRequestsPage from "./components/PickupRequestsPage";
import UsersPage from "./components/UsersPage";
import type { Bin, CollectionRoute, User } from "./types";
import "./App.css";

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <main className="auth-loading">Checking your session…</main>;
  return user ? <>{children}</> : <Navigate to="/login" replace state={{ from: location }} />;
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(name, email, password);
      await signIn(email, password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || "/dashboard", { replace: true });
    } catch (cause) {
      setError(getApiError(cause, "Could not connect to the server. Check that the backend is running."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">♻</div>
        <p className="eyebrow">SMART WASTE · KIGALI</p>
        <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-description">
          {isRegister ? "Join your community to follow waste collection." : "Sign in to view live bin status across Kigali."}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <form className="auth-form" onSubmit={submit}>
          {isRegister && (
            <label>Full name
              <input autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label>Email address
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>Password
            <input type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
            {isRegister && <span className="field-hint">Use at least 8 characters.</span>}
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? "Already have an account? " : "New to Smart Waste? "}
          <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link>
        </p>
      </section>
      <p className="auth-footer">Cleaner neighborhoods start with better information.</p>
    </main>
  );
}

function RoutesPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<CollectionRoute[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [driverId, setDriverId] = useState("");
  const [routeDrivers, setRouteDrivers] = useState<Record<number, string>>({});
  const [selectedBins, setSelectedBins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  if (user?.role !== "admin" && user?.role !== "driver") return <Navigate to="/dashboard" replace />;

  const load = useCallback(async () => {
    if (!isAdmin && user?.role !== "driver") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const routeData = await getRoutes();
      setRoutes(routeData);
      if (isAdmin) {
        const [binData, driverData] = await Promise.all([getBins(), getDrivers()]);
        setBins(binData.filter((bin) => bin.fill_level > 95 && bin.status !== "maintenance" && !routeData.some((route) => route.status !== "completed" && route.stops.some((stop) => stop.bin_id === bin.id))));
        setDrivers(driverData);
      }
      setError(null);
    } catch (cause) {
      setError(getApiError(cause, "Could not load routes. Check that the backend is running."));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.role]);

  useEffect(() => { void load(); }, [load]);

  const submitRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createRoute({
        name,
        scheduled_date: scheduledDate,
        driver_id: driverId ? Number(driverId) : null,
        bin_ids: selectedBins,
      });
      setRoutes((current) => [...current, created].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)));
      setName("");
      setDriverId("");
      setSelectedBins([]);
      setBins((current) => current.filter((bin) => !selectedBins.includes(bin.id)));
      setNotice("Route created and ready for collection.");
    } catch (cause) {
      setError(getApiError(cause, "Could not create the route."));
    } finally {
      setBusy(false);
    }
  };

  const markCollected = async (routeId: number, stopId: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await collectRouteStop(routeId, stopId);
      setRoutes((current) => current.map((route) => route.id === updated.id ? updated : route));
      setNotice("Stop submitted for admin approval. Bin remains full until approval.");
    } catch (cause) {
      setError(getApiError(cause, "Could not update this stop."));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (id: number) => {
    if (!routeDrivers[id]) return;
    setBusy(true);
    try {
      await assignRoute(id, Number(routeDrivers[id]));
      await load();
      setNotice("Bin collection assigned to driver.");
    } catch (cause) { setError(getApiError(cause, "Could not assign this collection.")); }
    finally { setBusy(false); }
  };

  const approve = async (id: number) => {
    setBusy(true);
    try {
      await approveRoute(id);
      await load();
      setNotice("Completion approved. Bins are now empty.");
    } catch (cause) { setError(getApiError(cause, "Could not approve this route.")); }
    finally { setBusy(false); }
  };

  return (
    <main className="container">
      <header className="page-header">
        <div>
          <p className="eyebrow">SMART WASTE · KIGALI</p>
          <h1>{isAdmin ? "Route planning" : "My collection routes"}</h1>
          <p className="subtitle">{isAdmin ? "Assign drivers to full-bin collections. Bins enter this queue automatically above 95%." : "Your assigned collections, in stop order."}</p>
        </div>
        <div className="header-actions">
          <span className="role-pill">{user?.role}</span>
          <Link className="nav-link" to="/dashboard">Dashboard</Link>
          <Link className="nav-link" to="/pickup-requests">Requests</Link>
          {isAdmin && <Link className="nav-link" to="/users">Users</Link>}
          <button onClick={() => void load()} disabled={loading}>Refresh</button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {isAdmin && (
        <section className="route-create-panel">
          <div>
            <p className="eyebrow">NEW COLLECTION</p>
            <h2>Plan a route</h2>
            <p className="subtitle">Choose a date, a driver, and the bins in collection order.</p>
          </div>
          <form className="route-form" onSubmit={submitRoute}>
            <label>Route name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Kimihurura morning pickup" /></label>
            <div className="route-form-row">
              <label>Collection date<input type="date" required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
              <label>Driver
                <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="bin-picker">
              <legend>Stops <span>({selectedBins.length} selected, in selection order)</span></legend>
              {bins.length === 0 ? <p className="field-hint">No available full bins. Bins qualify when approved deliveries bring them above 95%.</p> : bins.map((bin) => (
                <label className="bin-option" key={bin.id}>
                  <input
                    type="checkbox"
                    checked={selectedBins.includes(bin.id)}
                    onChange={(event) => setSelectedBins((current) => event.target.checked ? [...current, bin.id] : current.filter((id) => id !== bin.id))}
                  />
                  <span>{bin.location_name}</span><small>{Math.round(bin.fill_level)}% full</small>
                </label>
              ))}
            </fieldset>
            <button className="primary-button" type="submit" disabled={busy || selectedBins.length === 0}>{busy ? "Saving…" : "Create route"}</button>
          </form>
        </section>
      )}

      <section className="routes-section">
        <div className="section-heading"><h2>{isAdmin ? "Scheduled routes" : "Your routes"}</h2><span>{routes.length} total</span></div>
        {loading ? <p>Loading routes…</p> : routes.length === 0 ? (
          <p className="empty-state">{isAdmin ? "No routes yet. Create one above to assign a driver and bins." : "No routes are assigned to your account yet."}</p>
        ) : (
          <div className="route-list">
            {routes.map((route) => (
              <article className="route-card" key={route.id}>
                <header className="route-card-header">
                  <div><h3>{route.name}</h3><p>{new Date(`${route.scheduled_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}{isAdmin && ` · ${route.driver?.name ?? "Unassigned"}`}</p></div>
                  <span className={`route-status ${route.status}`}>{route.status.replace("_", " ")}</span>
                </header>
                {isAdmin && route.status === "planned" && <div className="assign-control">
                  <select aria-label={`Driver for ${route.name}`} value={routeDrivers[route.id] ?? route.driver_id?.toString() ?? ""} onChange={(event) => setRouteDrivers((current) => ({ ...current, [route.id]: event.target.value }))}>
                    <option value="">Choose driver</option>
                    {drivers.filter((driver) => driver.is_active).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </select>
                  <button disabled={busy || !routeDrivers[route.id]} onClick={() => void assign(route.id)}>Assign collection</button>
                </div>}
                <ol className="stop-list">
                  {route.stops.map((stop) => (
                    <li key={stop.id} className={stop.collected_at ? "collected" : ""}>
                      <span className="stop-number">{stop.stop_order}</span>
                      <span className="stop-name"><strong>{stop.bin.location_name}</strong><small>{Math.round(stop.bin.fill_level)}% full · {stop.bin.capacity_liters} L</small></span>
                      {stop.collected_at ? <span className="collected-label">{route.status === "completed" ? "Approved" : "Awaiting approval"}</span> : !isAdmin ? (
                        <button className="stop-action" disabled={busy} onClick={() => void markCollected(route.id, stop.id)}>Submit accomplished stop</button>
                      ) : <span>Awaiting driver</span>}
                    </li>
                  ))}
                </ol>
                {isAdmin && route.status === "in_progress" && route.stops.every((stop) => stop.collected_at) && <button disabled={busy} onClick={() => void approve(route.id)}>Approve completion and empty bins</button>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AppRoutes() {
  const { user, ready } = useAuth();
  if (!ready) return <main className="auth-loading">Checking your session…</main>;
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/pickup-requests" element={<Protected><PickupRequestsPage /></Protected>} />
      <Route path="/users" element={<Protected><UsersPage /></Protected>} />
      <Route path="/routes" element={<Protected><RoutesPage /></Protected>} />
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
