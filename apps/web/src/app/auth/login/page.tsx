"use client";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { API_URL, setAccessToken } from "@/lib/api";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") })
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setMessage(payload?.error?.message ?? "Sign in failed."); return; }
    setAccessToken(payload.data.accessToken);
    window.location.assign("/dashboard");
  }
  return <AuthShell title="Sign in" subtitle="Continue to your workspace." footer={<span>New here? <a href="/auth/register">Create an account</a></span>}>
    <Notice message={message} tone="error" />
    <form className="mp-form-grid" style={{gridTemplateColumns:"1fr"}} onSubmit={submit}>
      <div className="mp-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="mp-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /><a className="mp-helper" href="/auth/forgot-password">Forgot password?</a></div>
      <button className="mp-button" data-primary="true" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </AuthShell>;
}
