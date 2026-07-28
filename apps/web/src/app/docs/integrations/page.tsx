import { redirect } from "next/navigation";

export default function PublicIntegrationDocsRedirect() {
  redirect("/dashboard/api-docs/integrations");
}
