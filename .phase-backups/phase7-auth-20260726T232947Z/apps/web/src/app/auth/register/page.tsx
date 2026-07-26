"use client";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") })
    });
    const payload = await response.json();
    setMessage(response.ok ? "Check your email to verify the account." : payload?.error?.message ?? "Registration failed.");
  }
  return <main className="auth"><form className="auth-card" onSubmit={submit}>
    <h1>Create workspace</h1><p className="muted">Start with secure local SSD/HDD storage.</p>
    <label className="field">Name<input name="name" required /></label>
    <label className="field">Email<input name="email" type="email" required /></label>
    <label className="field">Password<input name="password" type="password" minLength={12} required /></label>
    <button className="primary">Create account</button>
    {message && <div className="notice">{message}</div>}
  </form></main>;
}
