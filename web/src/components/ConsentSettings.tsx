"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EmailOtpVerifier from "@/components/EmailOtpVerifier";
import { MARKETING_CONSENT_TEXT } from "@/lib/consent-text";

export default function ConsentSettings({ cardCode }: { cardCode: string }) {
  const [state, setState] = useState<"loading" | "verify" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);

  const loadConsent = useCallback(async () => {
    try {
      const response = await fetch(`/api/customer/consents?cardCode=${encodeURIComponent(cardCode)}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setMessage(response.status === 403 ? "Bitte bestätigen Sie die E-Mail-Adresse, die zu dieser Karte gehört." : "");
        setState("verify");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Einwilligung konnte nicht geladen werden.");
      setGranted(data.granted);
      setMessage("");
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einwilligung konnte nicht geladen werden.");
      setState("error");
    }
  }, [cardCode]);

  useEffect(() => {
    // The request sets state only after it completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConsent();
  }, [loadConsent]);

  async function updateConsent(next: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardCode, granted: next }),
      });
      if (response.status === 401 || response.status === 403) {
        setState("verify");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Einwilligung konnte nicht gespeichert werden.");
      setGranted(data.granted);
      setMessage(next ? "Einwilligung gespeichert." : "Einwilligung widerrufen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einwilligung konnte nicht gespeichert werden.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Datenschutz &amp; Einwilligungen</h2>
      {state === "loading" && <p className="mt-3 text-sm text-zinc-600">Einwilligung wird geladen…</p>}
      {state === "verify" && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-600">Bestätigen Sie die E-Mail-Adresse Ihrer Karte, um Ihre Einwilligung zu verwalten.</p>
          <label htmlFor="consent-email" className="block text-sm font-medium text-zinc-700">E-Mail</label>
          <input id="consent-email" type="email" autoComplete="email" value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900" />
          <EmailOtpVerifier email={email} onVerified={() => void loadConsent()} />
        </div>
      )}
      {state === "ready" && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-3 text-sm text-zinc-700">
            <input type="checkbox" checked={granted === true} disabled={busy}
              onChange={(event) => void updateConsent(event.target.checked)}
              className="mt-1 h-4 w-4 accent-indigo-600" />
            <span>{MARKETING_CONSENT_TEXT}</span>
          </label>
          {granted === null && <p className="text-sm text-zinc-500">Es liegt noch keine Entscheidung vor.</p>}
        </div>
      )}
      {message && <p role="status" className="mt-3 text-sm text-zinc-600">{message}</p>}
      {state === "error" && (
        <button type="button" onClick={() => void loadConsent()} className="mt-3 text-sm font-medium text-indigo-700">
          Erneut versuchen
        </button>
      )}
    </section>
  );
}
