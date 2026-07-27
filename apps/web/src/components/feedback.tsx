export function Feedback({
  message,
  variant = "info",
  onClose
}: {
  message: string;
  variant?: "info" | "success" | "danger" | "warning";
  onClose?: () => void;
}) {
  if (!message) return null;
  return (
    <div className={`alert alert-${variant} alert-dismissible`} role="alert">
      {message}
      {onClose && <button className="btn-close" onClick={onClose} aria-label="Close" />}
    </div>
  );
}
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return <div className="d-flex align-items-center gap-2 text-secondary py-4">
    <span className="spinner-border spinner-border-sm" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}
export function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state">
    <i className={`bi ${icon}`} />
    <h3 className="h6 text-dark">{title}</h3>
    <p className="mb-0">{text}</p>
  </div>;
}
