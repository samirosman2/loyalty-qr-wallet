"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Html5Qrcode } from "html5-qrcode";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Customer, LoyaltyCard, PointTransaction, Reward, Shop } from "@/types/loyalty";

interface CardData {
  card: LoyaltyCard;
  customer: Customer;
  shop: Shop;
  rewards: Reward[];
  transactions: PointTransaction[];
}

const SCANNER_ID = "qr-reader";

export default function MerchantScanner() {
  const router = useRouter();
  const [manualCode, setManualCode] = useState("");
  const [data, setData] = useState<CardData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customPoints, setCustomPoints] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const submittingRef = useRef(false);

  const loadCard = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoadingCard(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      if (!res.ok) {
        setData(null);
        setMessage({ kind: "error", text: json.error ?? "Could not load card." });
      } else {
        setData(json as CardData);
      }
    } catch {
      setMessage({ kind: "error", text: "Network error." });
    } finally {
      setLoadingCard(false);
    }
  }, [router]);

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
    submittingRef.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardCode: data.card.card_code,
          type,
          pointsDelta,
          rewardId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (res.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      const json = await res.json();
      if (res.ok && (json.status === "success" || json.status === "duplicate")) {
        setMessage({
          kind: "ok",
          text: type === "earn" ? `Added ${pointsDelta} point(s).` : "Reward redeemed.",
        });
      } else {
        setMessage({ kind: "error", text: describeError(json.status, json.error) });
      }
      await loadCard(data.card.card_code);
    } catch {
      setMessage({ kind: "error", text: "Network error. Check the balance before retrying." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const customValue = Number(customPoints);
  const customValid = Number.isInteger(customValue) && customValue > 0;
  const active = data?.card.status === "active";
  const btn = "rounded-xl px-4 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md space-y-5 bg-zinc-50 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Scan loyalty card</h1>
        <div className="flex gap-2">
        <Link href="/merchant/dashboard" className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
          Dashboard
        </Link>
        <button
          type="button"
          onClick={async () => {
            await stopScanner();
            await getSupabaseBrowserClient().auth.signOut();
            router.replace("/merchant/login");
            router.refresh();
          }}
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700"
        >
          Sign Out
        </button>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div id={SCANNER_ID} className={scanning ? "overflow-hidden rounded-xl" : "hidden"} />
        <button
          type="button"
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
          <button type="submit" disabled={loadingCard || !manualCode.trim()} className={`${btn} bg-indigo-600 text-white`}>
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
            <button
              type="button"
              disabled={submitting || !active}
              onClick={() => void submit("earn", 1)}
              className={`${btn} w-full bg-emerald-600 text-white`}
            >
              +1 Point
            </button>
            <div className="flex gap-2">
              <input
                type="number"
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
                disabled={submitting || !active || !customValid}
                onClick={() => {
                  void submit("earn", customValue).then(() => setCustomPoints(""));
                }}
                className={`${btn} bg-emerald-600 text-white`}
              >
                Add
              </button>
            </div>
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
                    disabled={submitting || !active || !canRedeem}
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
    default:
      return fallback ?? "Transaction failed.";
  }
}
