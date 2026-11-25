"use client";

import { useState } from "react";

export default function SaveCardPrompt() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your card link:", window.location.href);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Save Card to Phone</h2>
      <p className="mt-1 text-sm text-zinc-500">Keep your card one tap away.</p>
      <ul className="mt-3 space-y-2 text-sm text-zinc-700">
        <li><span className="font-medium">iOS:</span> Tap Share → Add to Home Screen</li>
        <li><span className="font-medium">Android:</span> Tap Menu → Add to Home screen</li>
      </ul>
      <button
        type="button"
        onClick={copyLink}
        className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-3 text-base font-semibold text-white"
      >
        {copied ? "Link copied!" : "Copy Card Link"}
      </button>
    </section>
  );
}
