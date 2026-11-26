"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

type BrandChoice = { brand_id: string; role: "owner" | "manager"; name: string };

export default function SelectBrand({ brands }: { brands: BrandChoice[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function select(brandId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/merchant/select-brand", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not select brand.");
      router.replace(data.redirect);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not select brand.");
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-zinc-50 px-4 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">Choose a brand</h1>
      <div className="mt-6 space-y-3">
        {brands.map((brand) => (
          <button key={brand.brand_id} disabled={busy} onClick={() => void select(brand.brand_id)}
            className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-zinc-200 disabled:opacity-50">
            <span className="font-semibold">{brand.name}</span><span className="text-sm capitalize text-zinc-500">{brand.role}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      <div className="mt-6"><SignOutButton /></div>
    </main>
  );
}
