"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";

export function ConfirmEmailClient() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Processing…");
  const [variant, setVariant] = useState<"info" | "success" | "danger">("info");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setVariant("danger");
      setMessage("Confirmation token is missing.");
      return;
    }

    void fetch(`${API_URL}/api/v1/account-public/confirm-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const payload = await response.json();

      setVariant(response.ok ? "success" : "danger");
      setMessage(
        response.ok
          ? "Email changed. Please sign in again."
          : (payload.error?.message ?? "Confirmation failed."),
      );
    });
  }, [searchParams]);

  return (
    <AuthShell
      title="Confirm new email"
      subtitle="Secure account confirmation."
    >
      <Feedback message={message} variant={variant} />
      <a className="btn btn-primary w-100" href="/auth/login">
        Go to sign in
      </a>
    </AuthShell>
  );
}
