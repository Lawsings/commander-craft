// Fichier: components/Progress.jsx
import React from 'react';

export default function Progress({ label, value, targetMin, targetMax }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, targetMin)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="muted">{value} / {targetMin}–{targetMax}</span>
      </div>
      <div className="bar-bg">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
