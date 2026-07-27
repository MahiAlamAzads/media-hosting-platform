export function StatCard({
  icon, label, value, hint
}: { icon: string; label: string; value: string; hint?: string }) {
  return <div className="card stat-card">
    <div className="card-body d-flex align-items-start gap-3">
      <div className="stat-icon"><i className={`bi ${icon}`} /></div>
      <div><div className="text-secondary small">{label}</div><div className="stat-value">{value}</div>
      {hint && <div className="text-secondary small">{hint}</div>}</div>
    </div>
  </div>;
}
