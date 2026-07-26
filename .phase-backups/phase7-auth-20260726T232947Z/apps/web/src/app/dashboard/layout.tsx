const links = [
  { label: "Overview", href: "/dashboard" },
  { label: "Media", href: "/dashboard/media" },
  { label: "Folders", href: "/dashboard/folders" },
  { label: "Uploads", href: "/dashboard/media" },
  { label: "API Keys", href: "#" },
  { label: "Usage", href: "#" },
  { label: "Developers", href: "#" },
  { label: "Settings", href: "#" }
];

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          M<span>edia Platform</span>
        </div>
        <nav className="nav">
          {links.map(link => (
            <a href={link.href} key={link.label}>
              <span className="label">{link.label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>Workspace</strong>
          <span className="muted">Secure local storage</span>
        </header>
        {children}
      </main>
    </div>
  );
}
