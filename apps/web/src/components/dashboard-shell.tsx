"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";

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

  return (
    <nav aria-label="Primary navigation">
      {groups.map(group => (
        <div className="mp-nav-section" key={group.label}>
          <div className="mp-nav-group">{group.label}</div>
          <div className="mp-nav">
            {group.links.map(([label, href]) => {
              const active =
                href === "/dashboard"
                  ? pathname === href
                  : pathname.startsWith(href);

              return (
                <a
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                >
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function DashboardShell({
  children
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function signOut(): Promise<void> {
    await logout();
    window.location.assign("/auth/login");
  }

  return (
    <div className="mp-shell">
      <a className="mp-skip" href="#main">Skip to content</a>

      <button
        className="mp-backdrop"
        data-open={open}
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
      />

      <aside
        className="mp-sidebar"
        data-open={open}
        aria-label="Workspace navigation"
      >
        <div className="mp-sidebar-head">
          <a className="mp-brand" href="/dashboard">
            <span className="mp-triangle" aria-hidden="true" />
            <span>Media Platform</span>
          </a>
          <button
            type="button"
            className="mp-sidebar-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <Navigation close={() => setOpen(false)} />

        <div className="mp-sidebar-foot">
          <div className="mp-sidebar-status">
            <span className="mp-status-dot" aria-hidden="true" />
            Workspace connected
          </div>
          <a href="/docs">Developer documentation</a>
        </div>
      </aside>

      <div className="mp-main">
        <header className="mp-topbar">
          <div className="mp-topbar-left">
            <button
              type="button"
              className="mp-button mp-mobile-menu"
              onClick={() => setOpen(true)}
            >
              Menu
            </button>
            <div className="mp-topbar-meta">
              <div className="mp-topbar-title">Workspace</div>
              <div className="mp-topbar-subtitle">
                Secure media infrastructure
              </div>
            </div>
          </div>

          <div className="mp-topbar-actions">
            <ThemeToggle compact />
            <a
              className="mp-button"
              data-primary="true"
              href="/dashboard/upload"
            >
              Upload
            </a>
            <button type="button" className="mp-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <main id="main" className="mp-content">
          {children}
        </main>
      </div>

      <nav className="mp-mobile-nav" aria-label="Mobile navigation">
        <a href="/dashboard">Overview</a>
        <a href="/dashboard/media">Media</a>
        <a href="/dashboard/folders">Folders</a>
        <a href="/dashboard/upload">Upload</a>
        <a href="/dashboard/account">Account</a>
      </nav>
    </div>
  );
}
