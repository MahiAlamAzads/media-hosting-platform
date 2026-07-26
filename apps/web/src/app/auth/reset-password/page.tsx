"use client";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/api/v1/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.get("token"), password: form.get("password") })
    });
    const payload = await response.json();
    setMessage(response.ok ? "Password changed. Sign in again." : payload.error?.message ?? "Reset failed.");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Choose a new password</h1>
    <label className="field">New password<input name="password" type="password" minLength={12} required /></label>
    <p className="muted">Use 12+ characters with uppercase, lowercase and a number.</p>
    <button className="primary">Change password</button>
    {message && <div className="notice">{message}</div>}
    <a className="text-link" href="/auth/login">Sign in</a>
  </form></main>;
}
