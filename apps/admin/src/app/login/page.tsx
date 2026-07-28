"use client";
import { FormEvent, useState } from "react";
import { API_URL, clearAccessToken, setAccessToken, WORKSPACE_URL } from "@/lib/api";

export default function AdminLoginPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    clearAccessToken();
    const form = new FormData(event.currentTarget);

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setBusy(false);
      setMessage(payload?.error?.message ?? "Sign in failed.");
      return;
    }

    setAccessToken(payload.data.accessToken);
    const account = await fetch(`${API_URL}/api/v1/account/me`, {
      credentials: "include",
      headers: { authorization: `Bearer ${payload.data.accessToken}` }
    });
    const accountPayload = await account.json().catch(() => null);
    setBusy(false);

    if (!account.ok || !accountPayload?.data?.isPlatformAdmin) {
      clearAccessToken();
      setMessage("This account is not configured as a platform administrator.");
      return;
    }

    window.location.assign("/dashboard");
  }

  return <main className="admin-login d-flex align-items-center justify-content-center p-3">
    <div className="admin-login-card card">
      <div className="card-body p-4 p-lg-5">
        <div className="d-flex align-items-center gap-3 mb-4">
          <span className="admin-mark">MP</span>
          <div><strong className="d-block">Media Platform</strong><span className="text-secondary small">Restricted administration console</span></div>
        </div>
        <h1 className="h4 mb-1">Administrator sign in</h1>
        <p className="text-secondary mb-4">Only emails listed in PLATFORM_ADMIN_EMAILS can continue.</p>
        {message && <div className="alert alert-danger">{message}</div>}
        <form onSubmit={submit}>
          <div className="mb-3"><label className="form-label">Email address</label><input className="form-control" type="email" name="email" autoComplete="email" required /></div>
          <div className="mb-3"><label className="form-label">Password</label><input className="form-control" type="password" name="password" autoComplete="current-password" required /></div>
          <button className="btn btn-primary w-100" disabled={busy}>{busy ? "Checking access…" : "Sign in to admin"}</button>
        </form>
        <div className="d-flex justify-content-between mt-4 small"><a href={WORKSPACE_URL}>Workspace app</a><span className="text-secondary">Port 3002</span></div>
      </div>
    </div>
  </main>;
}
