"use client";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";

const links = [
  ["Overview", "/dashboard", "bi-speedometer2"],
  ["Media", "/dashboard/media", "bi-images"],
  ["Folders", "/dashboard/folders", "bi-folder2-open"],
  ["Upload", "/dashboard/upload", "bi-cloud-arrow-up"],
  ["Usage", "/dashboard/usage", "bi-bar-chart"],
  ["Audit logs", "/dashboard/audit", "bi-clock-history"],
  ["API docs", "/dashboard/api-docs", "bi-braces"],
  ["API keys", "/dashboard/api-keys", "bi-key"],
  ["Account", "/dashboard/account", "bi-person-circle"],
  ["Security", "/dashboard/security", "bi-shield-check"]
] as const;

function Nav({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <nav className="app-nav nav flex-column">
    {links.map(([label, href, icon]) => {
      const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
      return <a key={href} href={href} onClick={close} className={`nav-link ${active ? "active" : ""}`}>
        <i className={`bi ${icon}`} /><span>{label}</span>
      </a>;
    })}
  </nav>;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  async function signOut() {
    await logout();
    window.location.assign("/auth/login");
  }
  function toggleMobile(open: boolean) {
    document.getElementById("mobileSidebar")?.classList.toggle("show", open);
    document.getElementById("mobileBackdrop")?.classList.toggle("d-none", !open);
  }
  return <div className="app-shell">
    <aside className="app-sidebar">
      <a className="app-brand" href="/dashboard"><span className="auth-brand-mark">MP</span><strong>Media Platform</strong></a>
      <Nav />
    </aside>

    <div id="mobileSidebar" className="offcanvas offcanvas-start sidebar-mobile" tabIndex={-1}>
      <div className="offcanvas-header border-bottom border-secondary">
        <h5 className="offcanvas-title">Media Platform</h5>
        <button className="btn-close" onClick={() => toggleMobile(false)} />
      </div>
      <div className="offcanvas-body p-0"><Nav close={() => toggleMobile(false)} /></div>
    </div>
    <div id="mobileBackdrop" className="offcanvas-backdrop fade show d-none" onClick={() => toggleMobile(false)} />

    <div className="app-main">
      <header className="app-header px-3 px-lg-4 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-outline-secondary btn-icon d-lg-none" onClick={() => toggleMobile(true)} aria-label="Open menu">
            <i className="bi bi-list fs-5" />
          </button>
          <div><strong>Workspace</strong><div className="text-secondary small d-none d-sm-block">Secure media management</div></div>
        </div>
        <div className="d-flex gap-2">
          <a className="btn btn-primary btn-sm" href="/dashboard/upload"><i className="bi bi-cloud-arrow-up me-1" />Upload</a>
          <button className="btn btn-outline-secondary btn-sm" onClick={signOut}><i className="bi bi-box-arrow-right me-1" />Logout</button>
        </div>
      </header>
      <main className="app-content">{children}</main>
    </div>

    <nav className="mobile-bottom-nav">
      {links.slice(0, 5).map(([label, href, icon]) => <a href={href} key={href}><i className={`bi ${icon}`} /><span>{label}</span></a>)}
    </nav>
  </div>;
}
