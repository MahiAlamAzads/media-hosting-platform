"use client";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    const payload = await response.json();
    setMessage(response.ok ? "Login successful." : payload?.error?.message ?? "Login failed.");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Sign in</h1><p className="muted">Manage media, folders and developer access.</p>
    <label className="field">Email<input name="email" type="email" required /></label>
    <label className="field">Password<input name="password" type="password" minLength={12} required /></label>
    <button className="primary">Sign in</button>
    {message && <div className="notice">{message}</div>}
  </form></main>;
}
