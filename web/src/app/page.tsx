"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LAST_CARD_KEY } from "@/components/RememberCard";

const noopSubscribe = () => () => {};

function readSavedCode(): string | null {
  try {
    return localStorage.getItem(LAST_CARD_KEY);
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  // undefined on the server / first render, then the stored value (or null) on the client
  const saved = useSyncExternalStore<string | null | undefined>(noopSubscribe, readSavedCode, () => undefined);

  useEffect(() => {
    if (saved) router.replace(`/card/${encodeURIComponent(saved)}`);
  }, [saved, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) router.push(`/card/${encodeURIComponent(trimmed)}`);
  }

  if (saved !== null) return <main className="min-h-dvh bg-zinc-50" />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 bg-zinc-50 px-4 py-8">
      <header className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white shadow-lg">
          ★
        </div>
        <h1 className="mt-4 text-3xl font-bold text-zinc-900">Loyalty QR Wallet</h1>
        <p className="mt-2 text-zinc-600">Collect points and unlock rewards with your digital card.</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <label htmlFor="cardCode" className="text-sm font-medium text-zinc-700">Already have a card?</label>
        <input
          id="cardCode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="LC-XXXXXXXXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          className="block w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          Open my card
        </button>
      </form>

      <div className="space-y-3">
        <Link
          href="/join/test-cafe"
          className="block rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-center font-semibold text-zinc-900"
        >
          Join the demo shop
        </Link>
        <Link href="/merchant/login" className="block text-center text-sm font-medium text-indigo-600">
          Merchant Portal
        </Link>
      </div>
    </main>
  );
}
