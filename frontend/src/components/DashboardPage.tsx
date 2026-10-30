import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiError, getBins, getPickupRequests } from "../api";
import { useAuth } from "../auth";
import BinCard from "./BinCard";
import type { Bin, PickupRequest, PickupStatus } from "../types";

const STATUS_LABELS: Record<PickupStatus, string> = {
  requested: "Awaiting assignment",
  assigned: "Assigned",
  accepted: "In progress",
  submitted: "Awaiting approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<PickupStatus, string> = {
  requested: "#f5bd62",
  assigned: "#60a5fa",
  accepted: "#b49aff",
  submitted: "#f5bd62",
  completed: "#6ed7b5",
  cancelled: "#9cacc4",
};

function Metric({ label, value, detail, tone = "green" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`metric-card ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></article>;
}

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";
  const isDriver = user?.role === "driver";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestData, binData] = await Promise.all([getPickupRequests(), getBins()]);
      setRequests(requestData);
      setBins(binData);
      setError(null);
    } catch (cause) { setError(getApiError(cause, "Could not load your dashboard.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    requested: requests.filter((item) => item.status === "requested").length,
    assigned: requests.filter((item) => item.status === "assigned").length,
    accepted: requests.filter((item) => item.status === "accepted").length,
    submitted: requests.filter((item) => item.status === "submitted").length,
    completed: requests.filter((item) => item.status === "completed").length,
    cancelled: requests.filter((item) => item.status === "cancelled").length,
  }), [requests]);
  const total = requests.length;
  const completedPercent = total ? Math.round(counts.completed / total * 100) : 0;
  const averageFill = bins.length ? Math.round(bins.reduce((sum, bin) => sum + bin.fill_level, 0) / bins.length) : 0;
  const recent = requests.slice(0, 5);

  const statusData = (Object.keys(STATUS_LABELS) as PickupStatus[]).map((status) => ({
    status,
    count: counts[status],
    label: STATUS_LABELS[status],
  }));

  const activity = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const count = requests.filter((item) => item.created_at.slice(0, 10) === key).length;
    return { label: day.toLocaleDateString(undefined, { weekday: "short" }), count };
  });
  const activityMax = Math.max(1, ...activity.map((item) => item.count));

  return (
    <main className="container dashboard-container">
      <header className="page-header">
        <div><p className="eyebrow">SMART WASTE · KIGALI</p><h1>{isAdmin ? "Operations overview" : isDriver ? "Driver dashboard" : "Your waste collection"}</h1><p className="subtitle">{isAdmin ? `Good day, ${user?.name}. Here is the service overview.` : isDriver ? `Welcome, ${user?.name}. Here is your pickup workload.` : `Welcome, ${user?.name}. Track and request a collection here.`}</p></div>
        <div className="header-actions"><span className="role-pill">{user?.role}</span><Link className="nav-link" to="/pickup-requests">{isAdmin ? "Manage requests" : isDriver ? "My tasks" : "Pickup requests"}</Link>{isAdmin && <Link className="nav-link" to="/users">Users</Link>}{(isAdmin || isDriver) && <Link className="nav-link" to="/routes">Routes</Link>}<button onClick={() => void load()} disabled={loading}>Refresh</button><button onClick={signOut}>Sign out</button></div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading your dashboard…</p> : <>
        <section className="metric-grid">
          {isAdmin ? <>
            <Metric label="Total requests" value={total} detail="All residents" />
            <Metric label="Need assignment" value={counts.requested} detail="Waiting for a driver" tone="amber" />
            <Metric label="In progress" value={counts.accepted} detail="Accepted by drivers" tone="violet" />
            <Metric label="Fulfillment" value={`${completedPercent}%`} detail={`${counts.completed} completed`} tone="blue" />
          </> : isDriver ? <>
            <Metric label="Awaiting your response" value={counts.assigned} detail="Assigned tasks" tone="amber" />
            <Metric label="In progress" value={counts.accepted} detail="Accepted pickups" tone="violet" />
            <Metric label="Completed" value={counts.completed} detail="Your completed pickups" />
            <Metric label="Workload" value={counts.assigned + counts.accepted} detail="Open assigned tasks" tone="blue" />
          </> : <>
            <Metric label="My requests" value={total} detail="Pickup requests submitted" />
            <Metric label="Being handled" value={counts.assigned + counts.accepted} detail="Assigned or in progress" tone="violet" />
            <Metric label="Completed" value={counts.completed} detail="Collections finished" tone="blue" />
            <Metric label="Awaiting review" value={counts.requested} detail="Not assigned yet" tone="amber" />
          </>}
        </section>

        <section className="dashboard-charts">
          <article className="chart-card">
            <header><div><h2>Request status</h2><p>Current work across your view</p></div><span className="chart-total">{total} total</span></header>
            {total === 0 ? <p className="chart-empty">Request activity will appear here.</p> : <div className="status-chart">
              {statusData.filter((item) => item.count > 0).map((item) => <div className="status-row" key={item.status}><div className="status-row-label"><span><i style={{ background: STATUS_COLORS[item.status] }} />{item.label}</span><strong>{item.count} · {Math.round(item.count / total * 100)}%</strong></div><div className="status-track"><div style={{ width: `${Math.max(4, item.count / total * 100)}%`, background: STATUS_COLORS[item.status] }} /></div></div>)}
            </div>}
          </article>
          <article className="chart-card activity-card">
            <header><div><h2>New requests</h2><p>Activity over the last seven days</p></div></header>
            <div className="activity-chart" role="img" aria-label="Pickup requests created over the last seven days">
              {activity.map((item, index) => <div className="activity-column" key={`${item.label}-${index}`}><strong>{item.count || ""}</strong><div className="activity-track"><div style={{ height: `${item.count ? Math.max(8, item.count / activityMax * 100) : 0}%` }} /></div><span>{item.label}</span></div>)}
            </div>
          </article>
        </section>

        {isAdmin && <section className="bin-overview"><div><p className="eyebrow">COLLECTION NETWORK</p><h2>Bin status</h2></div><div className="bin-overview-metrics"><span><strong>{bins.length}</strong> registered bins</span><span><strong>{averageFill}%</strong> average fill</span><span><strong>{bins.filter((bin) => bin.fill_level > 95).length}</strong> at pickup threshold</span></div></section>}

        <section className="dashboard-bin-section"><div className="section-heading"><div><h2>Live bin network</h2><p>Fill calculated from approved deliveries. Bins above 95% enter the collection queue.</p></div></div>{bins.length === 0 ? <p className="empty-state">No bins are registered yet.</p> : <div className="grid">{bins.map((bin) => <BinCard key={bin.id} bin={bin} />)}</div>}</section>

        <section className="recent-section"><div className="section-heading"><div><h2>{isAdmin ? "Recent requests" : isDriver ? "Recent assigned tasks" : "Your recent requests"}</h2><p>Latest updates to pickup requests</p></div><Link className="text-link" to="/pickup-requests">View all</Link></div>
          {recent.length === 0 ? <p className="empty-state">No pickup requests yet. Use the requests page to get started.</p> : <div className="recent-list">{recent.map((item) => <article className="recent-item" key={item.id}><div className="recent-icon" aria-hidden="true">{item.status === "completed" ? "✓" : "↗"}</div><div className="recent-info"><strong>{item.waste_type} · {item.location}</strong><span>{isAdmin ? `${item.resident.name} · ` : ""}Pickup date ${new Date(`${item.requested_date}T12:00:00`).toLocaleDateString()}</span></div><span className={`request-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></article>)}</div>}
        </section>
      </>}
    </main>
  );
}
