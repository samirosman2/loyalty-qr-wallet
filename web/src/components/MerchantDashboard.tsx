"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import SignOutButton from "@/components/SignOutButton";
import type { LoyaltyBrand, Reward, Shop } from "@/types/loyalty";

type ShopWithStats = Shop & { rewards: Reward[]; card_count: number; customer_count: number };
type BrandWithStats = LoyaltyBrand & { branch_count: number };

const noopSubscribe = () => () => {};
const input =
  "block w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const btn = "rounded-xl px-4 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 print:hidden";

export default function MerchantDashboard() {
  const router = useRouter();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const [shops, setShops] = useState<ShopWithStats[]>([]);
  const [brands, setBrands] = useState<BrandWithStats[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState("");
  const [creationMode, setCreationMode] = useState<"brand" | "branch">("brand");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardPoints, setRewardPoints] = useState("");

  const handleUnauthorized = useCallback(() => router.replace("/merchant/login"), [router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/merchant/shops");
    if (res.status === 401) return handleUnauthorized();
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not load shops.");
    } else {
      setShops(json.shops);
      setBrands(json.brands);
      setSelectedId((current) => current ?? json.shops[0]?.id ?? null);
      setBrandId((current) => current || json.brands[0]?.id || "");
    }
    setLoading(false);
  }, [handleUnauthorized]);

  useEffect(() => {
    // initial data fetch on mount; state is only set after the awaited request
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return false;
      }
      const json = await res.json();
      if (!res.ok) {
        setError([json.error ?? "Request failed.", json.details].filter(Boolean).join(" "));
        return false;
      }
      if (url.endsWith("/shops") && json.shop) {
        setSelectedId(json.shop.id);
        if (creationMode === "brand" && json.shop.brand_id) {
          const selection = await fetch("/api/merchant/select-brand", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: json.shop.brand_id }),
          });
          const result = await selection.json();
          if (!selection.ok) throw new Error(`Brand created, but could not open setup. Select it from Switch brand. ${result.error ?? ""}`);
          router.replace(result.redirect);
          router.refresh();
          return true;
        }
      }
      await load();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createShop(e: FormEvent) {
    e.preventDefault();
    const ok = await call("/api/merchant/shops", "POST", {
      name: shopName,
      slug: shopSlug || shopName,
      description: shopDescription || undefined,
      ...(creationMode === "branch" ? { brandId } : {}),
    });
    if (ok) {
      setShopName("");
      setShopSlug("");
      setShopDescription("");
    }
  }

  async function addReward(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const ok = await call("/api/merchant/rewards", "POST", {
      shopId: selected.id,
      title: rewardTitle,
      points_required: Number(rewardPoints),
    });
    if (ok) {
      setRewardTitle("");
      setRewardPoints("");
    }
  }

  const selected = shops.find((s) => s.id === selectedId) ?? null;
  const selectedBrand = brands.find((brand) => brand.id === selected?.brand_id);
  const joinUrl = selected && origin ? `${origin}/join/${selected.slug}` : "";

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the join link:", joinUrl);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 bg-zinc-50 px-4 py-6 print:max-w-none print:bg-white">
      <header className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/merchant/select-brand" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700">
            Switch brand
          </Link>
          <Link href="/merchant/scan" className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
            Scan
          </Link>
          <SignOutButton />
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {brands.length > 0 && (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-zinc-900">Your brands</h2>
          {brands.map((brand) => (
            <div key={brand.id}>
              <p className="font-medium text-zinc-900">{brand.name}</p>
              <p className="text-sm text-zinc-500">
                <span className="capitalize">{brand.plan_tier}</span> plan · {brand.branch_count} / {brand.max_branches} active branches
              </p>
            </div>
          ))}
        </section>
      )}

      {shops.length > 0 && (
        <section className={card}>
          <label htmlFor="shop" className="text-sm font-medium text-zinc-700">Shop</label>
          <select
            id="shop"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className={`${input} mt-1`}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </section>
      )}

      {selected && (
        <>
          <section className={card}>
            {selectedBrand ? (
              <>
                <h2 className="font-semibold text-zinc-900">{selectedBrand.name}</h2>
                <p className="text-sm capitalize text-zinc-500">{selectedBrand.plan_tier} plan</p>
                <p className="text-sm text-zinc-500">
                  Active branches: {selectedBrand.branch_count} / {selectedBrand.max_branches}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">This shop has no accessible brand.</p>
            )}
          </section>
          <section className={`${card} grid grid-cols-2 gap-3 text-center`}>
            <div>
              <p className="text-3xl font-bold text-zinc-900">{selected.customer_count}</p>
              <p className="text-sm text-zinc-500">Customers</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-zinc-900">{selected.card_count}</p>
              <p className="text-sm text-zinc-500">Cards</p>
            </div>
          </section>

          <section className="flex flex-col items-center rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-zinc-200 print:shadow-none print:ring-0">
            <h2 className="text-lg font-semibold text-zinc-900">Join {selected.name}</h2>
            <p className="mb-4 text-sm text-zinc-500">Scan to get your loyalty card</p>
            {joinUrl && <QRCodeSVG value={joinUrl} size={208} level="M" marginSize={1} title={`Sign-up QR for ${selected.name}`} />}
            <p className="mt-3 break-all text-xs text-zinc-500">{joinUrl}</p>
            <div className="mt-4 flex w-full gap-2 print:hidden">
              <button onClick={copyJoinLink} disabled={!joinUrl} className={`${btn} flex-1 bg-zinc-900 text-white`}>
                {copied ? "Copied!" : "Copy Join Link"}
              </button>
              <button onClick={() => window.print()} disabled={!joinUrl} className={`${btn} flex-1 border border-zinc-300 text-zinc-900`}>
                Print Sign-Up QR
              </button>
            </div>
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className="font-semibold text-zinc-900">Rewards</h2>
            {selected.rewards.length === 0 && <p className="text-sm text-zinc-500">No rewards yet.</p>}
            {selected.rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate font-medium ${r.is_active ? "text-zinc-900" : "text-zinc-400 line-through"}`}>{r.title}</p>
                  <p className="text-sm text-zinc-500">{r.points_required} pts</p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void call("/api/merchant/rewards", "PATCH", { rewardId: r.id, is_active: !r.is_active })}
                  className={`${btn} shrink-0 py-2 text-sm ${r.is_active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}
                >
                  {r.is_active ? "Active" : "Inactive"}
                </button>
              </div>
            ))}
            <form onSubmit={addReward} className="space-y-2 border-t border-zinc-100 pt-3">
              <input value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)} placeholder="Reward title" required aria-label="Reward title" className={input} />
              <div className="flex gap-2">
                <input type="number" min={1} step={1} inputMode="numeric" value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} placeholder="Points required" required aria-label="Points required" className={input} />
                <button type="submit" disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Add</button>
              </div>
            </form>
          </section>
        </>
      )}

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCreationMode("brand")} aria-pressed={creationMode === "brand"}
            className={`${btn} text-sm ${creationMode === "brand" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-700"}`}>
            + Create New Brand
          </button>
          <button type="button" onClick={() => setCreationMode("branch")} disabled={brands.length === 0}
            aria-pressed={creationMode === "branch"}
            className={`${btn} text-sm ${creationMode === "branch" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-700"}`}>
            + Add Branch to Brand
          </button>
        </div>
        <h2 className="font-semibold text-zinc-900">{creationMode === "brand" ? "Create a brand and its first branch" : "Add a branch"}</h2>
        {creationMode === "brand" && <p className="text-sm text-zinc-500">The brand and its first branch will share this name.</p>}
        <form onSubmit={createShop} className="space-y-2">
          {creationMode === "branch" && (
            <label className="block text-sm font-medium text-zinc-700">
              Brand
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} required className={`${input} mt-1`}>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name} ({brand.plan_tier}, {brand.branch_count} / {brand.max_branches} active branches)
                  </option>
                ))}
              </select>
            </label>
          )}
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop name" required aria-label="Shop name" className={input} />
          <input value={shopSlug} onChange={(e) => setShopSlug(e.target.value)} placeholder="URL slug (optional, e.g. test-cafe)" aria-label="Slug" className={input} />
          <input value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} placeholder="Description (optional)" aria-label="Description" className={input} />
          <button type="submit" disabled={busy || (creationMode === "branch" && !brandId)} className={`${btn} w-full bg-indigo-600 text-white`}>
            {creationMode === "brand" ? "Create brand" : "Add branch"}
          </button>
        </form>
      </section>
    </main>
  );
}
