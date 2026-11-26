import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership } from "@/lib/brand-access";

async function OwnerOnly({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/merchant/login");
  const membership = await getActiveMembership(user.id);
  if (!membership) redirect("/merchant/select-brand");
  if (membership.role !== "owner" || membership.loyalty_brands.owner_user_id !== user.id) redirect("/merchant/scan");
  return children;
}

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}><OwnerOnly>{children}</OwnerOnly></Suspense>;
}
