import { useState } from "react";
import type { Bin } from "../types";

interface BinCardProps {
  bin: Bin;
  canEdit: boolean;
  onFillLevelChange: (id: number, fillLevel: number) => Promise<void>;
}

function levelClass(level: number): string {
  if (level >= 80) return "high";
  if (level >= 50) return "medium";
  return "low";
}

export default function BinCard({ bin, canEdit, onFillLevelChange }: BinCardProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? bin.fill_level;

  const commit = async () => {
    if (draft === null) return;
    const value = draft;
    try {
      await onFillLevelChange(bin.id, value);
    } finally {
      setDraft(null);
    }
  };

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

      {canEdit && (
        <label className="simulate">
          Adjust fill level
          <input
            type="range"
            min={0}
            max={100}
            value={shown}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
          />
        </label>
      )}
    </article>
  );
}
