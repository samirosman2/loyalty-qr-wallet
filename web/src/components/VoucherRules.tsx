"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SpendVoucherRule } from "@/types/loyalty";

const blank = { id: "", name: "", min_spend_amount: "", window_days: "30", discount_type: "percent", discount_value: "", voucher_valid_days: "30", is_active: true };
const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";

export default function VoucherRules() {
  const [rules, setRules] = useState<SpendVoucherRule[]>([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/brand/voucher-rules");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load voucher rules.");
    setRules(data.rules);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load voucher rules."));
  }, [load]);
  async function save(rule: object) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/brand/voucher-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rule) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save voucher rule.");
      await load();
      setMessage("Voucher rule saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save voucher rule.");
      return false;
    } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await save({ ...form, id: form.id || null, window_days: Number(form.window_days), voucher_valid_days: Number(form.voucher_valid_days) })) setForm(blank);
  }
  function edit(rule: SpendVoucherRule) {
    setForm({ ...rule, min_spend_amount: String(rule.min_spend_amount), discount_value: String(rule.discount_value), window_days: String(rule.window_days), voucher_valid_days: String(rule.voucher_valid_days) });
  }
  return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
    <h2 className="text-xl font-semibold">Spend Voucher Rules</h2>
    <p className="mt-1 text-sm text-zinc-500">Issue a voucher when rolling EUR spend reaches the threshold.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-emerald-700">{message}</p>}
    <div className="mt-4 space-y-2">
      {rules.map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3">
        <div><p className="font-semibold">{rule.name} · {rule.is_active ? "Active" : "Inactive"}</p><p className="text-sm text-zinc-500">€{Number(rule.min_spend_amount).toFixed(2)} in {rule.window_days} days · {rule.discount_type === "percent" ? `${rule.discount_value}%` : `€${Number(rule.discount_value).toFixed(2)}`} discount · valid {rule.voucher_valid_days} days</p></div>
        <div className="flex gap-3"><button type="button" onClick={() => edit(rule)} className="text-sm font-medium text-indigo-700">Edit</button><button type="button" disabled={busy} onClick={() => void save({ ...rule, is_active: !rule.is_active })} className="text-sm font-medium text-indigo-700 disabled:opacity-50">{rule.is_active ? "Disable" : "Enable"}</button></div>
      </div>)}
      {!rules.length && <p className="text-sm text-zinc-500">No voucher rules yet.</p>}
    </div>
    <form onSubmit={submit} className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
      <h3 className="font-semibold sm:col-span-2 lg:col-span-3">{form.id ? "Edit rule" : "Create rule"}</h3>
      <label className="text-sm">Name<input required maxLength={100} className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="text-sm">Minimum spend (EUR)<input required type="number" min="0" max="99999999.99" step="0.01" className={input} value={form.min_spend_amount} onChange={(e) => setForm({ ...form, min_spend_amount: e.target.value })} /></label>
      <label className="text-sm">Rolling window (days)<input required type="number" min="1" max="3650" step="1" className={input} value={form.window_days} onChange={(e) => setForm({ ...form, window_days: e.target.value })} /></label>
      <label className="text-sm">Discount type<select className={input} value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed EUR</option></select></label>
      <label className="text-sm">Discount value<input required type="number" min="0.01" max={form.discount_type === "percent" ? "100" : "99999999.99"} step="0.01" className={input} value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></label>
      <label className="text-sm">Voucher validity (days)<input required type="number" min="1" max="3650" step="1" className={input} value={form.voucher_valid_days} onChange={(e) => setForm({ ...form, voucher_valid_days: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
      <button disabled={busy} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save rule</button>
      {form.id && <button type="button" onClick={() => setForm(blank)} className="text-sm text-zinc-600">Cancel edit</button>}
    </form>
  </section>;
}
