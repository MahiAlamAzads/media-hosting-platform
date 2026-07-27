import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Loading } from "@/components/ui";
import { ResetPasswordClient } from "./reset-password-client";
export default function Page(){return <Suspense fallback={<AuthShell title="Choose a new password" subtitle="Reading the reset link."><Loading/></AuthShell>}><ResetPasswordClient/></Suspense>}
