export function AuthShell({
  title, subtitle, children, footer
}: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <main className="auth-page d-flex align-items-center justify-content-center p-3 py-5">
    <div className="auth-panel">
      <div className="text-center mb-4">
        <a href="/" className="d-inline-flex align-items-center gap-2 text-dark">
          <span className="auth-brand-mark">MP</span><strong className="fs-5">Media Platform</strong>
        </a>
      </div>
      <div className="card auth-card">
        <div className="card-body p-4 p-sm-5">
          <h1 className="h3 mb-2">{title}</h1><p className="text-secondary mb-4">{subtitle}</p>
          {children}
        </div>
        {footer && <div className="card-footer bg-white text-center py-3">{footer}</div>}
      </div>
    </div>
  </main>;
}
