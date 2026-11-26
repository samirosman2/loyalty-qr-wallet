import { Suspense } from "react";
import JoinForm from "@/components/JoinForm";
import { getBrandThemeByShopSlug } from "@/lib/brand";

async function JoinContent({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const brand = await getBrandThemeByShopSlug(shopSlug);
  return <JoinForm shopSlug={shopSlug} brand={brand} />;
}

export default function JoinPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <JoinContent params={params} />
    </Suspense>
  );
}
