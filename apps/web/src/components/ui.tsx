export function Notice({
  message,
  tone = "info"
}: {
  message: string;
  tone?: "info" | "success" | "error" | "warning";
}) {
  if (!message) return null;
  return <div className="mp-notice" data-tone={tone} role="status">{message}</div>;
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="mp-loading"><span className="mp-spinner" aria-hidden="true"/><span>{label}</span></div>;
}
export function Empty({
  title,
  text
}: {
  title: string;
  text: string;
}) {
  return <div className="mp-empty"><h3>{title}</h3><p>{text}</p></div>;
}
export function PageHead({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return <header className="mp-page-head">
    <h1>{title}</h1>
    <p>{description}</p>
    {children && <div className="mp-page-actions">{children}</div>}
  </header>;
}
export function SectionHead({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return <div className="mp-section-head"><h2>{title}</h2><p>{description}</p></div>;
}
export function Stat({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return <div className="mp-stat"><div className="mp-stat-label">{label}</div><div className="mp-stat-value">{value}</div>{detail&&<div className="mp-stat-detail">{detail}</div>}</div>;
}
