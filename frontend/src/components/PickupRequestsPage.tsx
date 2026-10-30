import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  acceptPickupRequest,
  assignPickupRequest,
  clearPickupHistory,
  completePickupRequest,
  createPickupRequest,
  deletePickupRequest,
  getApiError,
  getDrivers,
  getPickupRequests,
  updatePickupRequest,
} from "../api";
import { useAuth } from "../auth";
import type { PickupRequest, PickupRequestInput, User } from "../types";

const WASTE_TYPES = ["Household waste", "Recyclables", "Organic waste", "Bulky items", "Other"];

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function RequestForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: PickupRequestInput;
  submitLabel: string;
  onSave: (data: PickupRequestInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try { await onSave(form); } catch { /* The parent displays the API error. */ } finally { setBusy(false); }
  };

  return (
    <form className="request-form" onSubmit={submit}>
      <label>Pickup location<input required minLength={4} maxLength={255} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Street, neighborhood, or nearby landmark" /></label>
      <div className="request-form-row">
        <label>Waste type<select value={form.waste_type} onChange={(event) => setForm({ ...form, waste_type: event.target.value })}>{WASTE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Preferred pickup date<input type="date" min={localDate()} required value={form.requested_date} onChange={(event) => setForm({ ...form, requested_date: event.target.value })} /></label>
      </div>
      <label>Notes<textarea required minLength={5} maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Tell us about the amount of waste or access instructions." /></label>
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}

export default function PickupRequestsPage() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "admin";
  const isDriver = user?.role === "driver";
  const isResident = user?.role === "resident";
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [driverChoices, setDriverChoices] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requestList = await getPickupRequests();
      setRequests(requestList);
      if (isAdmin) setDrivers(await getDrivers());
      setError(null);
    } catch (cause) {
      setError(getApiError(cause, "Could not load pickup requests."));
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: requests.length,
    requested: requests.filter((item) => item.status === "requested").length,
    assigned: requests.filter((item) => item.status === "assigned").length,
    accepted: requests.filter((item) => item.status === "accepted").length,
    completed: requests.filter((item) => item.status === "completed").length,
  }), [requests]);
  const visibleRequests = filter === "all" ? requests : requests.filter((item) => item.status === filter);

  const handleCreate = async (data: PickupRequestInput) => {
    setError(null);
    try {
      const created = await createPickupRequest(data);
      setRequests((current) => [created, ...current]);
      setNotice("Your pickup request has been sent to the collection team.");
    } catch (cause) { setError(getApiError(cause, "Could not submit your request.")); throw cause; }
  };

  const handleUpdate = async (id: number, data: PickupRequestInput) => {
    setError(null);
    try {
      const updated = await updatePickupRequest(id, data);
      setRequests((current) => current.map((item) => item.id === id ? updated : item));
      setEditingId(null);
      setNotice("Pickup request updated.");
    } catch (cause) { setError(getApiError(cause, "Could not update this request.")); throw cause; }
  };

  const replaceRequest = (updated: PickupRequest, message: string) => {
    setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
    setNotice(message);
    setError(null);
  };

  const assign = async (id: number) => {
    const chosenDriver = driverChoices[id];
    if (!chosenDriver) { setError("Choose a driver before assigning this request."); return; }
    setBusy(true);
    try { replaceRequest(await assignPickupRequest(id, Number(chosenDriver)), "Request assigned to the driver."); }
    catch (cause) { setError(getApiError(cause, "Could not assign this request.")); }
    finally { setBusy(false); }
  };

  const driverAction = async (item: PickupRequest, action: "accept" | "complete") => {
    setBusy(true);
    try {
      const updated = action === "accept" ? await acceptPickupRequest(item.id) : await completePickupRequest(item.id);
      replaceRequest(updated, action === "accept" ? "Task accepted. You can now mark it complete." : "Pickup marked complete.");
    } catch (cause) { setError(getApiError(cause, "Could not update this task.")); }
    finally { setBusy(false); }
  };

  const removeHistory = async () => {
    if (!window.confirm("Delete all completed and cancelled pickup records? This cannot be undone.")) return;
    setBusy(true);
    try {
      const deleted = await clearPickupHistory();
      setRequests((current) => current.filter((item) => item.status !== "completed" && item.status !== "cancelled"));
      setNotice(`${deleted} past record${deleted === 1 ? "" : "s"} deleted.`);
      setError(null);
    } catch (cause) { setError(getApiError(cause, "Could not clear past records.")); }
    finally { setBusy(false); }
  };

  const removeOne = async (item: PickupRequest) => {
    if (!window.confirm(`Delete completed request #${item.id}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deletePickupRequest(item.id);
      setRequests((current) => current.filter((entry) => entry.id !== item.id));
      setNotice("Past request deleted.");
      setError(null);
    } catch (cause) { setError(getApiError(cause, "Could not delete this record.")); }
    finally { setBusy(false); }
  };

  return (
    <main className="container">
      <header className="page-header">
        <div><p className="eyebrow">SMART WASTE · KIGALI</p><h1>{isResident ? "Pickup requests" : isDriver ? "Driver workboard" : "Request management"}</h1><p className="subtitle">{isResident ? "Request a collection and track its progress." : isDriver ? "Review your assigned pickups and update their progress." : "Review resident requests and coordinate collection."}</p></div>
        <div className="header-actions"><span className="role-pill">{user?.role}</span><Link className="nav-link" to="/dashboard">Dashboard</Link>{isAdmin && <Link className="nav-link" to="/users">Users</Link>}{(isAdmin || isDriver) && <Link className="nav-link" to="/routes">Routes</Link>}<button onClick={() => void load()} disabled={loading}>Refresh</button><button onClick={signOut}>Sign out</button></div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="request-summary">
        <button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}><strong>{counts.all}</strong><span>All requests</span></button>
        <button className={filter === "requested" ? "selected" : ""} onClick={() => setFilter("requested")}><strong>{counts.requested}</strong><span>Awaiting assignment</span></button>
        <button className={filter === "assigned" ? "selected" : ""} onClick={() => setFilter("assigned")}><strong>{counts.assigned}</strong><span>Assigned</span></button>
        <button className={filter === "accepted" ? "selected" : ""} onClick={() => setFilter("accepted")}><strong>{counts.accepted}</strong><span>In progress</span></button>
        <button className={filter === "completed" ? "selected" : ""} onClick={() => setFilter("completed")}><strong>{counts.completed}</strong><span>Completed</span></button>
      </section>

      {isResident && (
        <section className="request-create-panel">
          <div><p className="eyebrow">NEED A COLLECTION?</p><h2>Request a pickup</h2><p className="subtitle">Share where and when you need waste collected. You can edit while it is awaiting assignment.</p></div>
          <RequestForm key={requests.length} initial={{ location: "", waste_type: WASTE_TYPES[0], description: "", requested_date: localDate() }} submitLabel="Send pickup request" onSave={handleCreate} />
        </section>
      )}

      <section className="requests-section">
        <div className="section-heading"><h2>{isAdmin ? "All resident requests" : isDriver ? "Assigned to me" : "Your request history"}</h2><div className="section-tools"><span>{visibleRequests.length} shown</span>{isAdmin && counts.completed > 0 && <button className="danger-button" onClick={() => void removeHistory()} disabled={busy}>Clear completed history</button>}</div></div>
        {loading ? <p>Loading requests…</p> : visibleRequests.length === 0 ? <p className="empty-state">{isResident ? "No requests match this view. Submit a pickup request above when you need a collection." : "No requests match this view yet."}</p> : (
          <div className="pickup-list">
            {visibleRequests.map((item) => {
              const canEdit = isAdmin ? item.status !== "completed" && item.status !== "cancelled" : isResident && item.resident_id === user?.id && item.status === "requested";
              const canAssign = isAdmin && (item.status === "requested" || item.status === "assigned");
              const initial = { location: item.location, waste_type: item.waste_type, description: item.description, requested_date: item.requested_date };
              return (
                <article className="pickup-card" key={item.id}>
                  <header className="pickup-card-header"><div><span className="request-number">REQUEST #{item.id}</span><h3>{item.waste_type}</h3><p>Pickup date · {new Date(`${item.requested_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</p></div><span className={`request-status ${item.status}`}>{item.status}</span></header>
                  <div className="pickup-details"><p><strong>Location</strong><span>{item.location}</span></p><p><strong>Notes</strong><span>{item.description}</span></p>{isAdmin && <p><strong>Requested by</strong><span>{item.resident.name}</span></p>}{item.driver && <p><strong>Driver</strong><span>{item.driver.name}</span></p>}</div>

                  {editingId === item.id ? <div className="request-edit"><RequestForm initial={initial} submitLabel="Save changes" onSave={(data) => handleUpdate(item.id, data)} onCancel={() => setEditingId(null)} /></div> : (
                    <div className="request-actions">
                      {canEdit && <button onClick={() => setEditingId(item.id)}>Edit details</button>}
                      {canAssign && <div className="assign-control"><select aria-label={`Assign request ${item.id} to a driver`} value={driverChoices[item.id] ?? item.driver_id?.toString() ?? ""} onChange={(event) => setDriverChoices((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose driver</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select><button className="primary-button" onClick={() => void assign(item.id)} disabled={busy || !((driverChoices[item.id] ?? item.driver_id?.toString()) || "")}>Assign driver</button></div>}
                      {isDriver && item.status === "assigned" && <button className="primary-button" onClick={() => void driverAction(item, "accept")} disabled={busy}>Accept task</button>}
                      {isDriver && item.status === "accepted" && <button className="primary-button" onClick={() => void driverAction(item, "complete")} disabled={busy}>Mark complete</button>}
                      {isAdmin && (item.status === "completed" || item.status === "cancelled") && <button className="danger-button" onClick={() => void removeOne(item)} disabled={busy}>Delete record</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
