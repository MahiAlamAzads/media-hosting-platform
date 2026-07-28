import { redirect } from "next/navigation";

export default function PublicDocsRedirect() {
  redirect("/dashboard/api-docs");
}
