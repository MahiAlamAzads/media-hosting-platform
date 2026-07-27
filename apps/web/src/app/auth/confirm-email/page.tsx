import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoadingBlock } from "@/components/feedback";
import { ConfirmEmailClient } from "./confirm-email-client";

function Fallback() {
  return (
    <AuthShell
      title="Confirm new email"
      subtitle="Secure account confirmation."
    >
      <LoadingBlock label="Reading confirmation link…" />
    </AuthShell>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ConfirmEmailClient />
    </Suspense>
  );
}
