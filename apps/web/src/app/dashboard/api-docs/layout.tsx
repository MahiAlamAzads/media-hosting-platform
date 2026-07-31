"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export default function DeveloperDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void apiRequest<{ data: { id: string } }>("/api/v1/account/me")
      .then(() => setReady(true))
      .catch(() => window.location.assign("/auth/login"));
  }, []);

  if (!ready) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5 text-secondary">
        <span className="spinner-border spinner-border-sm me-2" />
        Validating workspace access…
      </div>
    );
  }

  return children;
}
