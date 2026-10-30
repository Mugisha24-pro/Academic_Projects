import type { Bin } from "../types";

function levelClass(level: number): string {
  if (level > 95) return "high";
  if (level >= 50) return "medium";
  return "low";
}

export default function BinCard({ bin }: { bin: Bin }) {
  const shown = bin.fill_level;

  return (
    <article className={`card ${levelClass(shown)}`}>
      <header className="card-header">
        <h3>{bin.location_name}</h3>
        <span className={`badge ${bin.status}`}>{bin.status}</span>
      </header>

      <div
        className="meter"
        role="progressbar"
        aria-valuenow={Math.round(shown)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="meter-fill" style={{ width: `${shown}%` }} />
      </div>
      <p className="level">{Math.round(shown)}% full</p>

      <p className="meta">
        {bin.capacity_liters} L capacity · {bin.latitude.toFixed(4)}, {bin.longitude.toFixed(4)}
      </p>

      <p className="field-hint">{bin.status === "maintenance" ? "Unavailable for deliveries" : shown > 95 ? "Ready for collection - awaiting driver and approval" : "Fill increases when waste deliveries are approved"}</p>
    </article>
  );
}
