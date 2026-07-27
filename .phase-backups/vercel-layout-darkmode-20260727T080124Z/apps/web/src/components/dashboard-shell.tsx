"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/api";

const groups = [
  {
    label: "Workspace",
    links: [
      ["Overview", "/dashboard"],
      ["Media", "/dashboard/media"],
      ["Folders", "/dashboard/folders"],
      ["Upload", "/dashboard/upload"],
      ["Usage", "/dashboard/usage"]
    ]
  },
  {
    label: "Operations",
    links: [
      ["Audit logs", "/dashboard/audit"],
      ["API documentation", "/dashboard/api-docs"],
      ["API keys", "/dashboard/api-keys"]
    ]
  },
  {
    label: "Account",
    links: [
      ["Profile", "/dashboard/account"],
      ["Security", "/dashboard/security"]
    ]
  }
] as const;

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <nav aria-label="Primary navigation">
    {groups.map(group => <div key={group.label}>
      <div className="mp-nav-group">{group.label}</div>
      <div className="mp-nav">
        {group.links.map(([label, href]) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return <a key={href} href={href} aria-current={active ? "page" : undefined} onClick={close}>{label}</a>;
        })}
      </div>
    </div>)}
  </nav>;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  async function signOut() {
    await logout();
    window.location.assign("/auth/login");
  }
  return <div className="mp-shell">
    <a className="mp-skip" href="#main">Skip to content</a>
    <div className="mp-backdrop" data-open={open} onClick={() => setOpen(false)} />
    <aside className="mp-sidebar" data-open={open}>
      <a className="mp-brand" href="/dashboard">
        <span className="mp-triangle" aria-hidden="true" />
        <span>Media Platform</span>
      </a>
      <Navigation close={() => setOpen(false)} />
    </aside>
    <div className="mp-main">
      <header className="mp-topbar">
        <div className="mp-topbar-meta">
          <div className="mp-topbar-title">Workspace</div>
          <div className="mp-topbar-subtitle">Secure media infrastructure</div>
        </div>
        <div className="mp-topbar-actions">
          <button className="mp-button mp-mobile-menu" onClick={() => setOpen(true)}>Menu</button>
          <a className="mp-button" data-primary="true" href="/dashboard/upload">Upload</a>
          <button className="mp-button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main id="main" className="mp-content">{children}</main>
    </div>
    <nav className="mp-mobile-nav" aria-label="Mobile navigation">
      <a href="/dashboard">Overview</a>
      <a href="/dashboard/media">Media</a>
      <a href="/dashboard/folders">Folders</a>
      <a href="/dashboard/upload">Upload</a>
      <a href="/dashboard/account">Account</a>
    </nav>
  </div>;
}
