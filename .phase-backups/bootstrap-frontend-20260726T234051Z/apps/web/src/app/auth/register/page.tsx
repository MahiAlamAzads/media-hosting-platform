"use client";
import { FormEvent, useState } from "react";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") })
    });
    const payload = await response.json();
    setMessage(payload.data?.message ?? payload.error?.message ?? "Registration completed.");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Create workspace</h1><p className="muted">Email verification is required before sign in.</p>
    <label className="field">Name<input name="name" autoComplete="name" required /></label>
    <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
    <label className="field">Password<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
    <p className="muted">12+ characters, uppercase, lowercase and number.</p>
    <button className="primary">Create account</button>
    {message && <div className="notice">{message}</div>}
    <a className="text-link" href="/auth/login">Already have an account?</a>
  </form></main>;
}
