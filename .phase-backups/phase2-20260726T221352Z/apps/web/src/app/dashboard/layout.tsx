const links = ["Overview", "Media", "Folders", "Uploads", "API Keys", "Usage", "Developers", "Settings"];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">M<span>edia Platform</span></div>
      <nav className="nav">{links.map((link, index) =>
        <a className={index === 0 ? "active" : ""} href="#" key={link}><span className="label">{link}</span></a>
      )}</nav>
    </aside>
    <main className="main">
      <header className="topbar"><strong>Workspace</strong><span className="muted">Secure local storage</span></header>
      {children}
    </main>
  </div>;
}
