"use client";
import { FormEvent, useState } from "react";
import { setAccessToken } from "@/lib/api";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "Login failed."); return; }
    setAccessToken(payload.data.accessToken);
    window.location.assign("/dashboard");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Sign in</h1><p className="muted">Secure workspace and media access.</p>
    <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
    <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
    <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    {message && <div className="notice error">{message}</div>}
    <div className="auth-links"><a href="/auth/forgot-password">Forgot password?</a><a href="/auth/register">Create account</a></div>
  </form></main>;
}
