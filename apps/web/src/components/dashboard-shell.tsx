"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiRequest, logout } from "@/lib/api";
import { UsageWarningBanner } from "@/components/usage-warning-banner";

const regularGroups = [
  {
    label: "Workspace",
    links: [
      ["Overview", "/dashboard", "bi-speedometer2"],
      ["Media", "/dashboard/media", "bi-images"],
      ["Folders", "/dashboard/folders", "bi-folder2-open"],
      ["Upload", "/dashboard/upload", "bi-cloud-arrow-up"],
    ],
  },
  {
    label: "Billing",
    links: [
      ["Billing overview", "/dashboard/billing", "bi-credit-card"],
      [
        "Choose payment model",
        "/dashboard/billing/revenue-model",
        "bi-signpost-split",
      ],
      ["Subscription plans", "/dashboard/billing/plans", "bi-calendar-check"],
      ["Prepaid PAYG", "/dashboard/billing/pay-as-you-go", "bi-wallet2"],
      ["Enterprise", "/dashboard/billing/enterprise", "bi-buildings"],
      ["Usage and limits", "/dashboard/billing/usage", "bi-bar-chart"],
      ["Usage alerts", "/dashboard/billing/alerts", "bi-bell"],
      ["Payments", "/dashboard/billing/payments", "bi-wallet2"],
      ["Billing settings", "/dashboard/billing/settings", "bi-receipt"],
    ],
  },
  {
    label: "Developer",
    links: [
      ["Developer integration", "/dashboard/api-docs", "bi-braces"],
      [
        "Integration guide",
        "/dashboard/api-docs/integrations",
        "bi-code-square",
      ],
      ["AI agent skills", "/dashboard/api-docs/ai-agent-skills", "bi-stars"],
      ["API keys", "/dashboard/api-keys", "bi-key"],
      ["Audit logs", "/dashboard/audit", "bi-clock-history"],
      ["Legacy usage", "/dashboard/usage", "bi-pie-chart"],
    ],
  },
  {
    label: "Account",
    links: [
      ["Account", "/dashboard/account", "bi-person-circle"],
      ["Security", "/dashboard/security", "bi-shield-check"],
    ],
  },
] as const;

const platformAdminGroup = {
  label: "Platform",
  links: [
    [
      "Open admin console",
      process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002",
      "bi-shield-lock",
    ],
  ],
} as const;

const mobileLinks = [
  ["Overview", "/dashboard", "bi-speedometer2"],
  ["Media", "/dashboard/media", "bi-images"],
  ["Upload", "/dashboard/upload", "bi-cloud-arrow-up"],
  ["Billing", "/dashboard/billing", "bi-credit-card"],
  ["Account", "/dashboard/account", "bi-person-circle"],
] as const;

function Nav({
  close,
  isPlatformAdmin,
}: {
  close?: () => void;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const groups = isPlatformAdmin
    ? [
        ...regularGroups.slice(0, 3),
        platformAdminGroup,
        ...regularGroups.slice(3),
      ]
    : regularGroups;

  return (
    <nav className="app-nav nav flex-column">
      {groups.map((group) => (
        <div className="app-nav-group" key={group.label}>
          <div className="app-nav-label">{group.label}</div>
          {group.links.map(([label, href, icon]) => {
            const active =
              href === "/dashboard"
                ? pathname === href
                : pathname.startsWith(href);

            return (
              <a
                key={href}
                href={href}
                onClick={close}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <i className={`bi ${icon}`} />
                <span>{label}</span>
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    void apiRequest<{ data: { isPlatformAdmin: boolean } }>(
      "/api/v1/account/me",
    )
      .then((response) => {
        setIsPlatformAdmin(response.data.isPlatformAdmin);
      })
      .catch(() => undefined);
  }, []);

  async function signOut(): Promise<void> {
    await logout();
    window.location.assign("/auth/login");
  }

  function toggleMobile(open: boolean): void {
    document.getElementById("mobileSidebar")?.classList.toggle("show", open);
    document
      .getElementById("mobileBackdrop")
      ?.classList.toggle("d-none", !open);
    document.body.classList.toggle("overflow-hidden", open);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="app-brand" href="/dashboard">
          <span className="auth-brand-mark">MP</span>
          <div>
            <strong>Media Platform</strong>
            <div className="app-brand-subtitle">Workspace console</div>
          </div>
        </a>
        <Nav isPlatformAdmin={isPlatformAdmin} />
      </aside>

      <div
        id="mobileSidebar"
        className="offcanvas offcanvas-start sidebar-mobile"
        tabIndex={-1}
      >
        <div className="offcanvas-header border-bottom border-secondary">
          <h5 className="offcanvas-title">Media Platform</h5>
          <button
            className="btn-close"
            onClick={() => toggleMobile(false)}
            aria-label="Close menu"
          />
        </div>
        <div className="offcanvas-body p-0">
          <Nav
            close={() => toggleMobile(false)}
            isPlatformAdmin={isPlatformAdmin}
          />
        </div>
      </div>

      <div
        id="mobileBackdrop"
        className="offcanvas-backdrop fade show d-none"
        onClick={() => toggleMobile(false)}
      />

      <div className="app-main">
        <header className="app-header px-3 px-lg-4 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-outline-secondary btn-icon d-lg-none"
              onClick={() => toggleMobile(true)}
              aria-label="Open menu"
            >
              <i className="bi bi-list fs-5" />
            </button>
            <div>
              <strong>Workspace</strong>
              <div className="text-secondary small d-none d-sm-block">
                Media, usage and billing
              </div>
            </div>
          </div>

          <div className="d-flex gap-2">
            <a
              className="btn btn-outline-secondary btn-sm d-none d-sm-inline-flex"
              href="/pricing"
            >
              Pricing
            </a>
            <a className="btn btn-primary btn-sm" href="/dashboard/upload">
              <i className="bi bi-cloud-arrow-up me-1" />
              Upload
            </a>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={signOut}
            >
              <i className="bi bi-box-arrow-right me-1" />
              Logout
            </button>
          </div>
        </header>

        <main className="app-content">
          <UsageWarningBanner />
          {children}
        </main>
      </div>

      <nav className="mobile-bottom-nav">
        {mobileLinks.map(([label, href, icon]) => (
          <a href={href} key={href}>
            <i className={`bi ${icon}`} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
