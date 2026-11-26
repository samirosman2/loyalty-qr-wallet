"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Html5Qrcode } from "html5-qrcode";
import SignOutButton from "@/components/SignOutButton";
import type { Customer, CustomerVoucher, LoyaltyCard, PointTransaction, Reward, Shop } from "@/types/loyalty";

interface CardData {
  card: LoyaltyCard;
  customer: Customer;
  shop: Shop;
  rewards: Reward[];
  transactions: PointTransaction[];
  vouchers: CustomerVoucher[];
}

const SCANNER_ID = "qr-reader";

export default function MerchantScanner({ canAccessDashboard }: { canAccessDashboard: boolean }) {
  const router = useRouter();
  const [manualCode, setManualCode] = useState("");
  const [data, setData] = useState<CardData | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customPoints, setCustomPoints] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [billReference, setBillReference] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const submittingRef = useRef(false);
  const pendingRef = useRef<{ signature: string; key: string } | null>(null);
  const loadedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadShops() {
      try {
        const res = await fetch("/api/merchant/shops?mode=scan");
        if (res.status === 401) {
          router.replace("/merchant/login");
          return;
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load branches.");
        const activeShops: Shop[] = json.shops.filter((shop: Shop) => shop.is_active);
        if (!cancelled) {
          setShops(activeShops);
          setShopId(activeShops[0]?.id ?? "");
        }
      } catch (error) {
        if (!cancelled) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load branches." });
      }
    }
    void loadShops();
    return () => { cancelled = true; };
  }, [router]);

  const loadCard = useCallback(async (code: string, preserveMessage = false) => {
    const trimmed = code.trim();
    if (!trimmed || !shopId) return;
    setLoadingCard(true);
    if (!preserveMessage) setMessage(null);
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(trimmed)}?shopId=${encodeURIComponent(shopId)}`);
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      if (!res.ok) {
        setData(null);
        setMessage({ kind: "error", text: json.error ?? "Could not load card." });
      } else {
        if (loadedCodeRef.current !== trimmed) {
          setPurchaseAmount(""); setBillReference(""); setCustomPoints("");
        }
        loadedCodeRef.current = trimmed;
        setData(json as CardData);
      }
    } catch {
      setData(null);
      setMessage({ kind: "error", text: "Network error." });
    } finally {
      setLoadingCard(false);
    }
  }, [router, shopId]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        // scanner already stopped
      }
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            setManualCode(text);
            void stopScanner();
            void loadCard(text);
          },
          () => {}
        );
      } catch {
        scannerRef.current = null;
        setScanning(false);
        setMessage({ kind: "error", text: "Camera unavailable. Enter the card code manually." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanning, loadCard, stopScanner]);

  useEffect(() => () => void stopScanner(), [stopScanner]);

  async function submit(type: "earn" | "redeem", pointsDelta: number, rewardId?: string) {
    if (!data || submittingRef.current) return;
    const amount = purchaseAmount.trim().replace(",", ".");
    const bill = billReference.trim();
    const payload = {
      cardCode: data.card.card_code, shopId, type, pointsDelta, rewardId,
      ...(type === "earn" ? { purchaseAmount: amount, billReference: bill } : {}),
    };
    const signature = JSON.stringify(payload);
    if (pendingRef.current?.signature !== signature) pendingRef.current = { signature, key: crypto.randomUUID() };
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: pendingRef.current.key,
        }),
      });
      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      const json = await res.json();
      if (res.ok && (json.status === "success" || json.status === "duplicate")) {
        pendingRef.current = null;
        const issued = Array.isArray(json.issued_vouchers) ? json.issued_vouchers.length : 0;
        setMessage({
          kind: "ok",
          text: type === "earn" ? `Purchase recorded: ${pointsDelta} point(s).${issued ? ` ${issued} voucher${issued === 1 ? "" : "s"} issued!` : ""}` : "Reward redeemed.",
        });
        if (type === "earn") { setPurchaseAmount(""); setBillReference(""); setCustomPoints(""); }
      } else {
        if (res.status < 500) pendingRef.current = null;
        setMessage({ kind: "error", text: describeError(json.status, json.error) });
      }
      await loadCard(data.card.card_code, true);
    } catch {
      setMessage({ kind: "error", text: "Network error. Check the balance before retrying." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function redeemVoucher(voucherId: string) {
    if (!data || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/vouchers/redeem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardCode: data.card.card_code, shopId, voucherId }),
      });
      if (response.status === 401) { router.replace("/merchant/login"); return; }
      const result = await response.json();
      setMessage(response.ok ? { kind: "ok", text: "Voucher redeemed." } :
        { kind: "error", text: describeError(result.status, result.error) });
      await loadCard(data.card.card_code, true);
    } catch {
      setMessage({ kind: "error", text: "Network error. Reload the card to check voucher status before retrying." });
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  const customValue = Number(customPoints);
  const customValid = Number.isInteger(customValue) && customValue > 0;
  const normalizedAmount = purchaseAmount.trim().replace(",", ".");
  const purchaseValid = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(normalizedAmount) &&
    Number(normalizedAmount) > 0 && !!billReference.trim() && billReference.trim().length <= 200;
  const active = data?.card.status === "active";
  const btn = "rounded-xl px-4 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 bg-zinc-50 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Scan loyalty card</h1>
        <div className="flex gap-2">
        {canAccessDashboard && <Link href="/merchant/dashboard" className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
          Dashboard
        </Link>}
        <Link href="/merchant/select-brand" className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700">
          Switch brand
        </Link>
        <SignOutButton beforeSignOut={stopScanner} />
        </div>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <label htmlFor="active-branch" className="block text-sm font-medium text-zinc-700">Active branch</label>
        {canAccessDashboard ? <select id="active-branch" value={shopId} disabled={scanning || loadingCard || submitting || shops.length === 0}
          onChange={(event) => { setShopId(event.target.value); setData(null); setMessage(null); loadedCodeRef.current = null; }}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-base">
          {shops.length === 0 && <option value="">No active branches available</option>}
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select> : <p id="active-branch" className="text-sm text-zinc-700">{shops.find((shop) => shop.id === shopId)?.name ?? "No active assigned branch"}</p>}
        <div id={SCANNER_ID} className={scanning ? "overflow-hidden rounded-xl" : "hidden"} />
        <button
          type="button"
          disabled={!shopId || loadingCard || submitting}
          onClick={() => (scanning ? void stopScanner() : setScanning(true))}
          className={`${btn} w-full bg-zinc-900 text-white`}
        >
          {scanning ? "Stop camera" : "Scan with camera"}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadCard(manualCode);
          }}
          className="flex gap-2"
        >
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="LC-XXXXXXXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            aria-label="Card code"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 font-mono text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button type="submit" disabled={loadingCard || submitting || !shopId || !manualCode.trim()} className={`${btn} bg-indigo-600 text-white`}>
            {loadingCard ? "…" : "Load Card"}
          </button>
        </form>
      </section>

      {message && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {data && (
        <>
          <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white">
            <p className="text-sm text-indigo-100">{data.shop.name}</p>
            <p className="text-xl font-semibold">{data.customer.full_name}</p>
            <p className="mt-3 text-4xl font-bold tabular-nums">
              {data.card.points_balance} <span className="text-base font-normal text-indigo-100">points</span>
            </p>
            {!active && (
              <p className="mt-2 text-sm font-medium capitalize text-amber-200">Card is {data.card.status}</p>
            )}
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="font-semibold text-zinc-900">Add points</h2>
            <label className="block text-sm font-medium text-zinc-700">Purchase amount (EUR)
              <input type="text" inputMode="decimal" disabled={submitting || loadingCard} value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)}
                placeholder="0.00" className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base" />
            </label>
            <label className="block text-sm font-medium text-zinc-700">Bill reference
              <input type="text" maxLength={200} disabled={submitting || loadingCard} value={billReference} onChange={(e) => setBillReference(e.target.value)}
                placeholder="Receipt number" className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base" />
            </label>
            <button
              type="button"
              disabled={submitting || loadingCard || !active || !purchaseValid}
              onClick={() => void submit("earn", 1)}
              className={`${btn} w-full bg-emerald-600 text-white`}
            >
              +1 Point
            </button>
            <div className="flex gap-2">
              <input
                type="number"
                disabled={submitting || loadingCard}
                inputMode="numeric"
                min={1}
                step={1}
                value={customPoints}
                onChange={(e) => setCustomPoints(e.target.value)}
                placeholder="Custom points"
                aria-label="Custom points"
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                type="button"
                disabled={submitting || loadingCard || !active || !customValid || !purchaseValid}
                onClick={() => void submit("earn", customValue)}
                className={`${btn} bg-emerald-600 text-white`}
              >
                Add
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="font-semibold text-zinc-900">Available vouchers</h2>
            {data.vouchers.length === 0 && <p className="text-sm text-zinc-500">No active vouchers.</p>}
            {data.vouchers.map((voucher) => (
              <div key={voucher.id} className="flex items-center justify-between gap-3">
                <div><p className="font-medium">{voucher.discount_type === "percent" ? `${voucher.discount_value}%` : `€${Number(voucher.discount_value).toFixed(2)}`} discount</p>
                  <p className="text-xs text-zinc-500">Expires {new Date(voucher.expires_at).toLocaleDateString()}</p></div>
                <button disabled={submitting || loadingCard || !active} onClick={() => void redeemVoucher(voucher.id)}
                  className={`${btn} shrink-0 bg-indigo-600 text-white`}>Redeem</button>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="font-semibold text-zinc-900">Rewards</h2>
            {data.rewards.length === 0 && <p className="text-sm text-zinc-500">No active rewards.</p>}
            {data.rewards.map((reward) => {
              const canRedeem = data.card.points_balance >= reward.points_required;
              return (
                <div key={reward.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{reward.title}</p>
                    <p className="text-sm text-zinc-500">{reward.points_required} pts</p>
                  </div>
                  <button
                    type="button"
                    disabled={submitting || loadingCard || !active || !canRedeem}
                    onClick={() => void submit("redeem", -reward.points_required, reward.id)}
                    className={`${btn} shrink-0 bg-indigo-600 text-white`}
                  >
                    Redeem
                  </button>
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <h2 className="mb-3 font-semibold text-zinc-900">Recent activity</h2>
            {data.transactions.length === 0 ? (
              <p className="text-sm text-zinc-500">No transactions yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {data.transactions.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium capitalize text-zinc-900">{t.type}</p>
                      <p className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`font-semibold tabular-nums ${t.points_delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {t.points_delta > 0 ? "+" : ""}
                      {t.points_delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function describeError(status?: string, fallback?: string) {
  switch (status) {
    case "insufficient_points":
      return "Not enough points for this action.";
    case "card_not_active":
      return "This card is not active.";
    case "card_not_found":
      return "Card not found.";
    case "invalid_reward":
      return "This reward is no longer available at this brand or its cost has changed.";
    case "idempotency_conflict":
      return "This transaction key was already used for a different action.";
    case "forbidden":
      return "You cannot manage this branch.";
    case "branch_not_active":
      return "This branch is not active.";
    case "duplicate_bill_reference":
      return "This receipt was already recorded at this branch.";
    case "purchase_details_required":
    case "invalid_purchase_amount":
      return "Enter a valid purchase amount and bill reference.";
    case "voucher_not_active":
      return "This voucher has already been redeemed or is no longer active.";
    case "voucher_expired":
      return "This voucher has expired.";
    case "voucher_not_found":
      return "Voucher not found for this card.";
    default:
      return fallback ?? "Transaction failed.";
  }
}
