import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import MerchantDashboard from "@/components/MerchantDashboard";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { destination, getActiveMembership, getMemberships } from "@/lib/brand-access";

async function ProtectedDashboard() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const memberships = await getMemberships(user.id);
  if (memberships.length) {
    const active = await getActiveMembership(user.id);
    if (!active) redirect("/merchant/select-brand");
    redirect(destination(active));
  }
  return <MerchantDashboard />;
}

export default function MerchantDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <ProtectedDashboard />
    </Suspense>
  );
}
