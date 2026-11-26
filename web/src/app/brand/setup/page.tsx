import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import BrandSetup from "@/components/BrandSetup";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership } from "@/lib/brand-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function SetupContent() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const member = await getActiveMembership(user.id);
  if (!member) redirect("/merchant/select-brand");
  if (member.role !== "owner" || member.loyalty_brands.owner_user_id !== user.id) redirect("/merchant/scan");
  if (member.loyalty_brands.onboarding_completed) redirect("/brand/dashboard");
  const { data, error } = await createSupabaseAdminClient().from("loyalty_brands")
    .select("legal_name, address, phone, contact_email, logo_url, primary_color, secondary_color")
    .eq("id", member.brand_id).single<{
      legal_name: string | null; address: string | null; phone: string | null; contact_email: string | null;
      logo_url: string | null; primary_color: string | null; secondary_color: string | null;
    }>();
  if (error) throw error;
  return <BrandSetup name={member.loyalty_brands.name} initial={data} />;
}

export default function SetupPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}><SetupContent /></Suspense>;
}
