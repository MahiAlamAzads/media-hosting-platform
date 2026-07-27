import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoadingBlock } from "@/components/feedback";
import { VerifyEmailClient } from "./verify-email-client";

function Fallback() {
  return (
    <AuthShell
      title="Verify email"
      subtitle="Secure account confirmation."
    >
      <LoadingBlock label="Reading verification link…" />
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <VerifyEmailClient />
    </Suspense>
  );
}
