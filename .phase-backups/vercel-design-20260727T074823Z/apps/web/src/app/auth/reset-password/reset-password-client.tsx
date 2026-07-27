"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<
    "success" | "danger"
  >("success");
  const [busy, setBusy] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const token = searchParams.get("token");

    if (!token) {
      setBusy(false);
      setVariant("danger");
      setMessage("Reset token is missing.");
      return;
    }

    const response = await fetch(
      `${API_URL}/api/v1/auth/reset-password`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token,
          password: formData.get("password")
        })
      }
    );

    const payload = await response.json();

    setBusy(false);
    setVariant(response.ok ? "success" : "danger");
    setMessage(
      response.ok
        ? "Password changed. Sign in again."
        : payload.error?.message ?? "Password reset failed."
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="All existing sessions will be revoked."
      footer={<a href="/auth/login">Go to sign in</a>}
    >
      <Feedback message={message} variant={variant} />

      <form onSubmit={submit}>
        <div className="mb-3">
          <label className="form-label">New password</label>
          <input
            className="form-control"
            name="password"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
          <div className="form-text">
            Use at least 12 characters with uppercase,
            lowercase and a number.
          </div>
        </div>

        <button
          className="btn btn-primary w-100"
          disabled={busy}
        >
          {busy ? (
            <>
              <span
                className="spinner-border spinner-border-sm me-2"
                aria-hidden="true"
              />
              Changing password…
            </>
          ) : (
            "Change password"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
