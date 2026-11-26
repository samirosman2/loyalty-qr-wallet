"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import EmailOtpVerifier from "@/components/EmailOtpVerifier";
import { CORE_CONSENT_TEXT, MARKETING_CONSENT_TEXT } from "@/lib/consent-text";
import type { LoyaltyCard } from "@/types/loyalty";

export default function JoinForm({ shopSlug }: { shopSlug: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [marketingAdsConsent, setMarketingAdsConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || verifiedEmail !== email.trim().toLowerCase()) {
      setError("Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/customers/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          fullName,
          email: email || undefined,
          phone: phone || undefined,
          marketingAdsConsent,
        }),
      });
      const data: { error?: string; card?: LoyaltyCard } = await res.json();
      if (!res.ok || !data.card) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      router.push(`/card/${encodeURIComponent(data.card.card_code)}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-zinc-50 px-4 py-8">
      <h1 className="text-3xl font-bold text-zinc-900">Join our loyalty program</h1>
      <p className="mt-2 text-zinc-600">Get your digital card and start collecting points.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div>
          <label htmlFor="fullName" className="text-sm font-medium text-zinc-700">Full name</label>
          <input id="fullName" required autoComplete="name" value={fullName}
            onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
          <input id="email" type="email" required inputMode="email" autoComplete="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setVerifiedEmail(""); }} className={inputClass} />
        </div>
        {verifiedEmail === email.trim().toLowerCase() && verifiedEmail ? (
          <p role="status" className="text-sm text-emerald-700">E-Mail-Adresse bestätigt.</p>
        ) : <EmailOtpVerifier email={email} onVerified={setVerifiedEmail} />}
        <div>
          <label htmlFor="phone" className="text-sm font-medium text-zinc-700">Phone (optional)</label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>

        <p className="text-sm text-zinc-600">{CORE_CONSENT_TEXT}</p>
        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input type="checkbox" checked={marketingAdsConsent} onChange={(e) => setMarketingAdsConsent(e.target.checked)}
            className="mt-1 h-4 w-4 accent-indigo-600" />
          <span>{MARKETING_CONSENT_TEXT}</span>
        </label>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={loading || !verifiedEmail || verifiedEmail !== email.trim().toLowerCase()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
          {loading ? "Creating your card…" : "Get my card"}
        </button>
      </form>
    </main>
  );
}
