import { Suspense } from "react";
import { redirect } from "next/navigation";
import MerchantDashboard from "@/components/MerchantDashboard";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

async function ProtectedDashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  return <MerchantDashboard />;
}

export default function MerchantDashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <ProtectedDashboard />
    </Suspense>
  );
}
