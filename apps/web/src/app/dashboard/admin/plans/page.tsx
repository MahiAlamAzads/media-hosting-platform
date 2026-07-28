import { redirect } from "next/navigation";
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";
export default function LegacyAdminPage() { redirect(`${ADMIN_URL}/plans`); }
