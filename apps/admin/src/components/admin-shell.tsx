"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest, logout, WORKSPACE_URL } from "@/lib/api";

const groups = [
  {
    label: "Platform",
    links: [
      ["Overview", "/dashboard", "bi-grid-1x2"],
      ["Users", "/users", "bi-people"],
      ["Workspaces", "/workspaces", "bi-buildings"],
    ],
  },
  {
    label: "Commercial",
    links: [
      ["Billing control", "/billing-control", "bi-sliders"],
      ["Plans", "/plans", "bi-boxes"],
      ["Subscriptions", "/subscriptions", "bi-arrow-repeat"],
      ["Payments", "/payments", "bi-cash-coin"],
      ["Payment accounts", "/payment-accounts", "bi-bank"],
      ["Prepaid wallets", "/wallets", "bi-wallet2"],
      ["Enterprise inquiries", "/enterprise-inquiries", "bi-buildings"],
      ["Usage", "/usage", "bi-bar-chart"],
    ],
  },
  {
    label: "Operations",
    links: [
      ["Queues & failures", "/operations", "bi-activity"],
      ["Audit trail", "/audit", "bi-clock-history"],
      ["Security events", "/security-events", "bi-shield-exclamation"],
      ["System health", "/system", "bi-heart-pulse"],
      ["Internal API docs", "/api-docs", "bi-braces-asterisk"],
    ],
  },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("Administrator");

  useEffect(() => {
    void apiRequest<{ data: { name: string; isPlatformAdmin: boolean } }>(
      "/api/v1/account/me",
    )
      .then((response) => {
        if (!response.data.isPlatformAdmin) {
          window.location.assign("/forbidden");
          return;
        }
        setName(response.data.name);
        setChecking(false);
      })
      .catch(() => window.location.assign("/login"));
  }, []);

  async function signOut() {
    await logout();
    window.location.assign("/login");
  }

  function toggleSidebar() {
    document.getElementById("adminSidebar")?.classList.toggle("show");
  }

  if (checking)
    return (
      <main className="admin-login d-flex align-items-center justify-content-center">
        <div className="d-flex align-items-center gap-2 text-secondary">
          <span className="spinner-border spinner-border-sm" />
          Validating administrator access…
        </div>
      </main>
    );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" id="adminSidebar">
        <a className="admin-brand" href="/dashboard">
          <span className="admin-mark">MP</span>
          <div>
            <strong className="d-block">Admin Console</strong>
            <small>Platform operations</small>
          </div>
        </a>
        <nav className="admin-nav nav flex-column">
          {groups.map((group) => (
            <div className="mb-3" key={group.label}>
              <div className="admin-nav-label">{group.label}</div>
              {group.links.map(([label, href, icon]) => {
                const active =
                  href === "/dashboard"
                    ? pathname === href
                    : pathname.startsWith(href);
                return (
                  <a
                    className={`nav-link ${active ? "active" : ""}`}
                    href={href}
                    key={href}
                    onClick={() =>
                      document
                        .getElementById("adminSidebar")
                        ?.classList.remove("show")
                    }
                  >
                    <i className={`bi ${icon}`} />
                    <span>{label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        <header className="admin-header px-3 px-lg-4 d-flex align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <button
              className="btn btn-outline-secondary btn-sm admin-mobile-toggle"
              onClick={toggleSidebar}
            >
              <i className="bi bi-list" />
            </button>
            <div>
              <strong>Platform administration</strong>
              <div className="text-secondary small">{name}</div>
            </div>
          </div>
          <div className="d-flex gap-2">
            <a
              className="btn btn-outline-secondary btn-sm"
              href={WORKSPACE_URL}
            >
              <i className="bi bi-box-arrow-up-right me-1" />
              Workspace app
            </a>
            <button className="btn btn-outline-danger btn-sm" onClick={signOut}>
              <i className="bi bi-box-arrow-right me-1" />
              Logout
            </button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
