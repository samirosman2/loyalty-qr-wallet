import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import BrandDashboard from "@/components/BrandDashboard";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership } from "@/lib/brand-access";

async function DashboardContent() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const member = await getActiveMembership(user.id);
  if (!member) redirect("/merchant/select-brand");
  if (member.role !== "owner" || member.loyalty_brands.owner_user_id !== user.id) redirect("/merchant/scan");
  if (!member.loyalty_brands.onboarding_completed) redirect("/brand/setup");
  return <BrandDashboard />;
}

export default function BrandDashboardPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}><DashboardContent /></Suspense>;
}
