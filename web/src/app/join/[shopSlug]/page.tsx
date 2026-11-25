import { Suspense } from "react";
import JoinForm from "@/components/JoinForm";

async function JoinContent({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  return <JoinForm shopSlug={shopSlug} />;
}

export default function JoinPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-zinc-50" />}>
      <JoinContent params={params} />
    </Suspense>
  );
}
