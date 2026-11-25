"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function MerchantLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace("/merchant/dashboard");
    router.refresh();
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-zinc-50 px-4 py-8">
      <h1 className="text-3xl font-bold text-zinc-900">Merchant sign in</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
          <input id="email" type="email" required autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
          <input id="password" type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-zinc-500">
          After signing in: <Link href="/merchant/dashboard" className="font-medium text-indigo-600">Dashboard</Link>
          {" · "}
          <Link href="/merchant/scan" className="font-medium text-indigo-600">Scan</Link>
        </p>
      </form>
    </main>
  );
}
