"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Verifying your email…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMessage("Verification token is missing."); return; }
    fetch(`${API}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    }).then(async response => {
      const payload = await response.json();
      setMessage(response.ok ? "Email verified. You can sign in." : payload.error?.message ?? "Verification failed.");
    });
  }, [params]);
  return <main className="auth"><section className="auth-card">
    <h1>Email verification</h1><div className="notice">{message}</div>
    <a className="primary button-link" href="/auth/login">Go to sign in</a>
  </section></main>;
}
