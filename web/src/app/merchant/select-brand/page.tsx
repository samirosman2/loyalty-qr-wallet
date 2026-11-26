import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getMemberships } from "@/lib/brand-access";
import SelectBrand from "@/components/SelectBrand";

async function SelectContent() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const memberships = await getMemberships(user.id);
  const brands = memberships.flatMap((m) =>
    m.is_active && (m.role === "owner" || m.role === "manager") ? [{ brand_id: m.brand_id, role: m.role, name: m.loyalty_brands.name }] : []);
  if (!brands.length) redirect(memberships.length ? "/merchant/login" : "/merchant/dashboard");
  return <SelectBrand brands={brands} />;
}

export default function SelectBrandPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}><SelectContent /></Suspense>;
}
