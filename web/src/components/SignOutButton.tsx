"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton({ beforeSignOut }: { beforeSignOut?: () => Promise<void> }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      if (beforeSignOut) await beforeSignOut();
      const response = await fetch("/api/merchant/logout", { method: "POST" });
      const data = await response.json();
      if (data.signedOut && response.ok) { router.replace("/merchant/login"); router.refresh(); return; }
      if (data.signedOut) { router.replace("/merchant/login?logoutAuditFailed=1"); router.refresh(); return; }
      throw new Error(data.error ?? "Sign out failed.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign out failed.");
      setBusy(false);
    }
  }
  return <div>
    <button disabled={busy} onClick={() => void signOut()} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50">Sign Out</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
