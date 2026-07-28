import { Suspense } from "react";
import { LoadingBlock } from "@/components/feedback";
import { InvoicePaymentClient } from "./payment-client";

export default function InvoicePaymentPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading invoice…" />}>
      <InvoicePaymentClient />
    </Suspense>
  );
}
