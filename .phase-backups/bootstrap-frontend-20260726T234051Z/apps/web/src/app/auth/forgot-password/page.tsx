"use client";
import { FormEvent, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email") })
    });
    const payload = await response.json();
    setMessage(payload.data?.message ?? payload.error?.message ?? "Request completed.");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Reset password</h1><p className="muted">We will email a short-lived reset link.</p>
    <label className="field">Email<input name="email" type="email" required /></label>
    <button className="primary">Send reset link</button>
    {message && <div className="notice">{message}</div>}
    <a className="text-link" href="/auth/login">Back to sign in</a>
  </form></main>;
}
