"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ConfirmEmailPage() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Confirming your new email…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMessage("Confirmation token is missing."); return; }
    fetch(`${API}/api/v1/account-public/confirm-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    }).then(async response => {
      const payload = await response.json();
      setMessage(response.ok ? "Email changed. Sign in again." : payload.error?.message ?? "Confirmation failed.");
    });
  }, [params]);
  return <main className="auth"><section className="auth-card">
    <h1>Confirm email</h1><div className="notice">{message}</div>
    <a className="primary button-link" href="/auth/login">Sign in</a>
  </section></main>;
}
