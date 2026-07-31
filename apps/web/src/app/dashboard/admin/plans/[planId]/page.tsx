import { redirect } from "next/navigation";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";
export default async function LegacyAdminPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  redirect(`${ADMIN_URL}/plans/${planId}`);
}
