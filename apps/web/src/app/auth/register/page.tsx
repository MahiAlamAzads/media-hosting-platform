"use client";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";
export default function RegisterPage() {
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const r = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        email: f.get("email"),
        password: f.get("password"),
      }),
    });
    const p = await r.json().catch(() => null);
    setBusy(false);
    setVariant(r.ok ? "success" : "danger");
    setMessage(p?.data?.message ?? p?.error?.message ?? "Request completed.");
  }
  return (
    <AuthShell
      title="Create an account"
      subtitle="Start a secure media workspace."
      footer={
        <span>
          Already registered? <a href="/auth/login">Sign in</a>
        </span>
      }
    >
      <Feedback message={message} variant={variant} />
      <form onSubmit={submit}>
        <div className="mb-3">
          <label className="form-label">Full name</label>
          <input
            className="form-control"
            name="name"
            autoComplete="name"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Email address</label>
          <input
            className="form-control"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            className="form-control"
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
          <div className="form-text password-note">
            12+ characters with uppercase, lowercase and a number.
          </div>
        </div>
        <button className="btn btn-primary w-100" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
