import { Suspense } from "react";
import { redirect } from "next/navigation";
import MerchantScanner from "@/components/MerchantScanner";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";

async function ProtectedScanner() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  return <MerchantScanner />;
}

export default function MerchantScanPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <ProtectedScanner />
    </Suspense>
  );
}
