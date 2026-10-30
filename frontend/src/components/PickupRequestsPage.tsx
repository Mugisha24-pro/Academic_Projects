import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  acceptPickupRequest,
  approvePickupRequest,
  assignPickupRequest,
  clearPickupHistory,
  completePickupRequest,
  createPickupRequest,
  deletePickupRequest,
  getApiError,
  getDrivers,
  getBins,
  getPickupRequests,
  updatePickupRequest,
} from "../api";
import { useAuth } from "../auth";
import type { Bin, PickupRequest, PickupRequestInput, User } from "../types";

const WASTE_TYPES = ["Household waste", "Recyclables", "Organic waste", "Bulky items", "Other"];

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function RequestForm({
  initial,
  bins,
  deliveryEditable = true,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: PickupRequestInput;
  bins: Bin[];
  deliveryEditable?: boolean;
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
        <label>Preferred pickup date<input type="date" min={initial.requested_date < localDate() ? initial.requested_date : localDate()} required value={form.requested_date} onChange={(event) => setForm({ ...form, requested_date: event.target.value })} /></label>
      </div>
      <div className="request-form-row">
        <label>Destination trash bin<select required disabled={!deliveryEditable} value={form.destination_bin_id || ""} onChange={(event) => setForm({ ...form, destination_bin_id: Number(event.target.value) })}>
          <option value="">Choose a destination</option>
          {bins.filter((bin) => bin.status !== "maintenance" || bin.id === form.destination_bin_id).map((bin) => <option key={bin.id} value={bin.id}>{bin.location_name} ({Math.round(bin.fill_level)}% full, {bin.capacity_liters} L)</option>)}
        </select></label>
        <label>Waste volume (litres)<input type="number" required min="0.01" step="0.01" disabled={!deliveryEditable} value={form.waste_volume_liters || ""} onChange={(event) => setForm({ ...form, waste_volume_liters: Number(event.target.value) })} /></label>
      </div>
      <p className="field-hint">The destination bin increases only after the driver's delivery is approved. Above 95%, it enters the bin collection queue.</p>
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
  const [bins, setBins] = useState<Bin[]>([]);
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
      const [requestList, binList] = await Promise.all([getPickupRequests(), getBins()]);
      setBins(binList);
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
    submitted: requests.filter((item) => item.status === "submitted").length,
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
      const payload = { ...data } as Partial<PickupRequestInput>;
      if (!payload.destination_bin_id || !payload.waste_volume_liters) {
        delete payload.destination_bin_id;
        delete payload.waste_volume_liters;
      }
      const updated = await updatePickupRequest(id, payload);
      setRequests((current) => current.map((item) => item.id === id ? updated : item));
      setEditingId(null);
      setNotice("Request updated. If the driver had already accepted or submitted it, they must confirm the revised details again.");
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

  const driverAction = async (item: PickupRequest, action: "accept" | "complete" | "approve") => {
    setBusy(true);
    try {
      const updated = action === "approve" ? await approvePickupRequest(item.id) : action === "accept" ? await acceptPickupRequest(item.id) : await completePickupRequest(item.id);
      if (action === "approve") setBins(await getBins());
      replaceRequest(updated, action === "accept" ? "Task accepted. You can now mark it complete." : action === "approve" ? "Completion approved." : "Submitted for admin approval.");
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
        <button className={filter === "submitted" ? "selected" : ""} onClick={() => setFilter("submitted")}><strong>{counts.submitted}</strong><span>Awaiting approval</span></button>
        <button className={filter === "completed" ? "selected" : ""} onClick={() => setFilter("completed")}><strong>{counts.completed}</strong><span>Completed</span></button>
      </section>

      {isResident && (
        <section className="request-create-panel">
          <div><p className="eyebrow">NEED A COLLECTION?</p><h2>Request a pickup</h2><p className="subtitle">Share where and when you need waste collected. You can edit your request until admin approves completion. Changes to accepted or submitted work require driver confirmation again.</p></div>
          <RequestForm bins={bins} key={requests.length} initial={{ destination_bin_id: 0, waste_volume_liters: 0, location: "", waste_type: WASTE_TYPES[0], description: "", requested_date: localDate() }} submitLabel="Send pickup request" onSave={handleCreate} />
        </section>
      )}

      <section className="requests-section">
        <div className="section-heading"><h2>{isAdmin ? "All resident requests" : isDriver ? "Assigned to me" : "Your request history"}</h2><div className="section-tools"><span>{visibleRequests.length} shown</span>{isAdmin && counts.completed > 0 && <button className="danger-button" onClick={() => void removeHistory()} disabled={busy}>Clear completed history</button>}</div></div>
        {loading ? <p>Loading requests…</p> : visibleRequests.length === 0 ? <p className="empty-state">{isResident ? "No requests match this view. Submit a pickup request above when you need a collection." : "No requests match this view yet."}</p> : (
          <div className="pickup-list">
            {visibleRequests.map((item) => {
              const canEdit = isAdmin ? item.status !== "completed" && item.status !== "cancelled" : isResident && item.resident_id === user?.id && item.status !== "completed" && item.status !== "cancelled";
              const canAssign = isAdmin && (item.status === "requested" || item.status === "assigned");
              const initial = { destination_bin_id: item.destination_bin_id ?? 0, waste_volume_liters: item.waste_volume_liters ?? 0, location: item.location, waste_type: item.waste_type, description: item.description, requested_date: item.requested_date };
              return (
                <article className="pickup-card" key={item.id}>
                  <header className="pickup-card-header"><div><span className="request-number">REQUEST #{item.id}</span><h3>{item.waste_type}</h3><p>Pickup date · {new Date(`${item.requested_date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</p></div><span className={`request-status ${item.status}`}>{item.status}</span></header>
                  <div className="pickup-details"><p><strong>Location</strong><span>{item.location}</span></p><p><strong>Destination bin</strong><span>{item.destination_bin?.location_name ?? "Not recorded (older request)"}</span></p><p><strong>Waste volume</strong><span>{item.waste_volume_liters == null ? "Not recorded" : `${item.waste_volume_liters} L`}</span></p><p><strong>Notes</strong><span>{item.description}</span></p>{isAdmin && <p><strong>Requested by</strong><span>{item.resident.name}</span></p>}{item.driver && <p><strong>Driver</strong><span>{item.driver.name}</span></p>}</div>

                  {editingId === item.id && canEdit ? <div className="request-edit"><RequestForm bins={bins} deliveryEditable={item.destination_bin_id !== null && item.waste_volume_liters !== null} initial={initial} submitLabel="Save changes" onSave={(data) => handleUpdate(item.id, data)} onCancel={() => setEditingId(null)} /></div> : (
                    <div className="request-actions">
                      {canEdit && <button onClick={() => setEditingId(item.id)}>Edit details</button>}
                      {canAssign && <div className="assign-control"><select aria-label={`Assign request ${item.id} to a driver`} value={driverChoices[item.id] ?? item.driver_id?.toString() ?? ""} onChange={(event) => setDriverChoices((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose driver</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select><button className="primary-button" onClick={() => void assign(item.id)} disabled={busy || !((driverChoices[item.id] ?? item.driver_id?.toString()) || "")}>Assign driver</button></div>}
                      {isDriver && item.status === "assigned" && <button className="primary-button" onClick={() => void driverAction(item, "accept")} disabled={busy}>Accept task</button>}
                      {isDriver && item.status === "accepted" && <button className="primary-button" onClick={() => void driverAction(item, "complete")} disabled={busy}>Submit accomplished task</button>}
                      {isAdmin && item.status === "submitted" && <button disabled={busy} onClick={() => void driverAction(item, "approve")}>Approve completion</button>}
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
