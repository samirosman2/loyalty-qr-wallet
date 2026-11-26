"use client";

import { useState } from "react";
import { getCustomerBrowserClient } from "@/lib/supabase/customer-browser";

export default function EmailOtpVerifier({
  email,
  onVerified,
}: {
  email: string;
  onVerified: (email: string) => void;
}) {
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const normalizedEmail = email.trim().toLowerCase();

  async function sendCode() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getCustomerBrowserClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setSentTo(normalizedEmail);
      setCode("");
      setMessage("Prüfen Sie Ihre E-Mail auf den Bestätigungscode.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Code konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getCustomerBrowserClient().auth.verifyOtp({
        email: normalizedEmail,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      onVerified(normalizedEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Code konnte nicht bestätigt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" disabled={busy || !normalizedEmail}
        onClick={() => void sendCode()}
        className="w-full rounded-xl border border-indigo-300 px-4 py-3 font-medium text-indigo-700 disabled:opacity-50">
        {sentTo && sentTo === normalizedEmail ? "Code erneut senden" : "E-Mail bestätigen"}
      </button>
      {sentTo && sentTo === normalizedEmail && (
        <div className="flex gap-2">
          <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric"
            autoComplete="one-time-code" aria-label="Bestätigungscode"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900" />
          <button type="button" disabled={busy || !code.trim()} onClick={() => void verifyCode()}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-50">
            Bestätigen
          </button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-zinc-600">{message}</p>}
    </div>
  );
}
