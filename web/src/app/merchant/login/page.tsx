import { Suspense } from "react";
import MerchantLogin from "@/components/MerchantLogin";
import { getBrandThemeBySlug } from "@/lib/brand";

async function LoginContent({ searchParams }: { searchParams: Promise<{ brand?: string; logoutAuditFailed?: string }> }) {
  const { brand, logoutAuditFailed } = await searchParams;
  const theme = typeof brand === "string" && brand ? await getBrandThemeBySlug(brand) : null;
  return <MerchantLogin brand={theme} logoutAuditFailed={logoutAuditFailed === "1"} />;
}

export default function MerchantLoginPage({ searchParams }: { searchParams: Promise<{ brand?: string; logoutAuditFailed?: string }> }) {
  return <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}><LoginContent searchParams={searchParams} /></Suspense>;
}
