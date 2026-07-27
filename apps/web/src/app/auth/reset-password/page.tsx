import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoadingBlock } from "@/components/feedback";
import { ResetPasswordClient } from "./reset-password-client";

function Fallback() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="All existing sessions will be revoked."
    >
      <LoadingBlock label="Reading reset link…" />
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
