const links = [
  { label: "Overview", href: "/dashboard" },
  { label: "Media", href: "/dashboard/media" },
  { label: "Folders", href: "/dashboard/folders" },
  { label: "API Keys", href: "/dashboard/api-keys" },
  { label: "Account", href: "/dashboard/account" },
  { label: "Security", href: "/dashboard/security" }
];

export default function DashboardLayout({children}:{children:React.ReactNode}) {
 return <div className="shell"><aside className="sidebar"><div className="brand">M<span>edia Platform</span></div>
 <nav className="nav">{links.map(link=><a href={link.href} key={link.href}><span className="label">{link.label}</span></a>)}</nav></aside>
 <main className="main"><header className="topbar"><strong>Workspace</strong><span className="muted">Protected by session validation</span></header>{children}</main></div>;
}
