import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import MerchantScanner from "@/components/MerchantScanner";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership, getMemberships } from "@/lib/brand-access";

async function ProtectedScanner() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const memberships = await getMemberships(user.id);
  const active = await getActiveMembership(user.id);
  if (memberships.length && !active) redirect("/merchant/select-brand");
  if (active?.role === "cashier") redirect("/merchant/login");
  if (active?.role === "owner" && !active.loyalty_brands.onboarding_completed) redirect("/brand/setup");
  return <MerchantScanner canAccessDashboard={active?.role !== "manager"} />;
}

export default function MerchantScanPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <ProtectedScanner />
    </Suspense>
  );
}
