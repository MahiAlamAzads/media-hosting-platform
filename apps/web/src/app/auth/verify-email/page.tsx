import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Loading } from "@/components/ui";
import { VerifyEmailClient } from "./verify-email-client";
export default function Page(){return <Suspense fallback={<AuthShell title="Verify email" subtitle="Confirming your account."><Loading/></AuthShell>}><VerifyEmailClient/></Suspense>}
