import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Loading } from "@/components/ui";
import { ConfirmEmailClient } from "./confirm-email-client";
export default function Page(){return <Suspense fallback={<AuthShell title="Confirm new email" subtitle="Confirming your account change."><Loading/></AuthShell>}><ConfirmEmailClient/></Suspense>}
