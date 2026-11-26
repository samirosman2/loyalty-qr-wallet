"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { contrastingText } from "@/lib/brand-style";

type Details = {
  legal_name: string | null; address: string | null; phone: string | null; contact_email: string | null;
  logo_url: string | null; primary_color: string | null; secondary_color: string | null;
};
const input = "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900";

export default function BrandSetup({ name, initial }: { name: string; initial: Details }) {
  const router = useRouter();
  const [values, setValues] = useState({
    legal_name: initial.legal_name ?? "", address: initial.address ?? "", phone: initial.phone ?? "",
    contact_email: initial.contact_email ?? "", logo_url: initial.logo_url ?? "",
    primary_color: /^#[0-9a-f]{6}$/i.test(initial.primary_color ?? "") ? initial.primary_color! : "#111827",
    secondary_color: /^#[0-9a-f]{6}$/i.test(initial.secondary_color ?? "") ? initial.secondary_color! : "#2563eb",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/merchant/brand-setup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save your brand.");
      router.replace("/brand/dashboard");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save your brand.");
      setBusy(false);
    }
  }
  const fields = [
    { key: "legal_name", label: "Legal name", type: "text" },
    { key: "address", label: "Business address", type: "text" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "contact_email", label: "Contact email", type: "email" },
    { key: "logo_url", label: "Logo URL (optional, HTTPS)", type: "url" },
  ] as const;
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-zinc-50 px-4 py-8">
      <Link href="/merchant/select-brand" className="text-sm text-indigo-700">Switch brand</Link>
      <h1 className="mt-4 text-3xl font-bold text-zinc-900">Set up {name}</h1>
      <p className="mt-2 text-zinc-600">Add your business details and choose your look.</p>
      <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl bg-white p-5 shadow-sm">
        {fields.map(({ key, label, type }) => (
          <label key={key} className="block text-sm font-medium text-zinc-700">{label}
            <input className={input} type={type} required={key !== "logo_url"} maxLength={key === "logo_url" ? 2048 : 500}
              value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          </label>
        ))}
        <div className="flex gap-6">
          {(["primary_color", "secondary_color"] as const).map((key) => (
            <label key={key} className="text-sm font-medium text-zinc-700">
              {key === "primary_color" ? "Primary color" : "Secondary color"}
              <input type="color" className="mt-2 block h-12 w-20" value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
            </label>
          ))}
        </div>
        <section className="rounded-2xl p-5" style={{ backgroundColor: values.primary_color, color: contrastingText(values.primary_color) }}>
          <p className="mb-3 text-xs uppercase">Live preview</p>
          <BrandLogo brand={{ name, logo_url: values.logo_url.startsWith("https://") ? values.logo_url : null, primary_color: values.primary_color, secondary_color: values.secondary_color }} />
          <p className="text-xl font-bold">{name}</p>
          <span className="mt-3 inline-block rounded-lg px-4 py-2 font-semibold"
            style={{ backgroundColor: values.secondary_color, color: contrastingText(values.secondary_color) }}>Your loyalty card</span>
        </section>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Complete setup"}
        </button>
      </form>
    </main>
  );
}
