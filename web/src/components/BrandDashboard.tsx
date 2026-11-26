"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import MerchantDashboard from "@/components/MerchantDashboard";
import VoucherRules from "@/components/VoucherRules";
import BrandReports from "@/components/BrandReports";

type Branch = { id: string; name: string; slug: string; branch_code: string | null; address: string | null; is_active: boolean; manager_count: number };
type Manager = { id: string; user_id: string; email: string; assigned_shop_id: string; is_active: boolean };
type Dashboard = {
  brand: { name: string; plan_tier: string; max_branches: number; legal_name: string; address: string; phone: string; contact_email: string; primary_color: string; secondary_color: string; logo_url: string | null };
  active_branches: number; customers: number; spend_eur: number; points_issued: number; points_redeemed: number; active_vouchers: number;
  shops: Branch[]; managers: Manager[];
};
type Audit = { id: string; shop_id: string | null; actor_email: string | null; event_type: string; created_at: string; metadata: Record<string, unknown> };
const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900";
const button = "rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const panel = "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200";
const blankBranch = { name: "", slug: "", branchCode: "", address: "", isActive: true, id: "" };

export default function BrandDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [branch, setBranch] = useState(blankBranch);
  const [manager, setManager] = useState({ email: "", password: "", shopId: "" });
  const [audit, setAudit] = useState<{ logs: Audit[]; count: number; page: number }>({ logs: [], count: 0, page: 0 });
  const [filters, setFilters] = useState({ shopId: "", eventType: "", from: "", to: "" });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const load = useCallback(async () => {
    const response = await fetch("/api/brand/dashboard");
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Could not load dashboard.");
    setData(json);
  }, []);

  const loadAudit = useCallback(async (page = 0) => {
    const params = new URLSearchParams({ ...appliedFilters, page: String(page) });
    const response = await fetch(`/api/brand/audit?${params}`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Could not load audit log.");
    setAudit(json);
  }, [appliedFilters]);

  useEffect(() => {
    // State updates occur after the network request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => setError(error instanceof Error ? error.message : "Could not load dashboard."));
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAudit().catch((error) => setError(error instanceof Error ? error.message : "Could not load audit log."));
  }, [loadAudit]);

  async function send(url: string, method: string, body: FormData | object, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, {
        method, ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Request failed.");
      await Promise.all([load(), loadAudit()]);
      setMessage(success);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed.");
      return false;
    } finally { setBusy(false); }
  }
  async function saveBranch(event: FormEvent) {
    event.preventDefault();
    if (await send("/api/brand/branches", "POST", { ...branch, id: branch.id || null }, "Branch saved.")) setBranch(blankBranch);
  }
  async function saveManager(event: FormEvent) {
    event.preventDefault();
    if (await send("/api/brand/managers", "POST", manager, "Manager created.")) setManager({ email: "", password: "", shopId: "" });
  }

  if (!data) return <main className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : "Loading dashboard…"}</main>;
  const { brand, shops, managers } = data;
  const kpis = [
    ["Active branches", `${data.active_branches} / ${brand.max_branches}`],
    ["Total customers", data.customers.toLocaleString()],
    ["Total spend", new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(data.spend_eur)],
    ["Points issued", data.points_issued.toLocaleString()],
    ["Points redeemed", data.points_redeemed.toLocaleString()],
    ["Active vouchers", data.active_vouchers.toLocaleString()],
  ];
  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-6 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-medium uppercase text-zinc-500">{brand.plan_tier} plan</p><h1 className="text-3xl font-bold">{brand.name} dashboard</h1></div>
          <nav className="flex flex-wrap items-center gap-3">
            <Link href="/merchant/scan" className={button}>Scan</Link>
            <Link href="/merchant/select-brand" className="text-sm font-medium text-indigo-700">Switch brand</Link>
            <SignOutButton />
          </nav>
        </header>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{message}</p>}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Brand performance">
          {kpis.map(([title, value]) => <div key={title} className={panel}><p className="text-sm text-zinc-500">{title}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
        </section>
        <p className="text-xs text-zinc-500">All-time totals. Spend includes recorded EUR purchases; active vouchers exclude expired vouchers.</p>
        <VoucherRules />
        <BrandReports shops={shops} />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="text-xl font-semibold">Brand settings</h2>
            {brand.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={`${brand.name} logo`} className="mt-3 max-h-20 max-w-40 object-contain" />
            )}
            <form key={JSON.stringify(brand)} onSubmit={(event) => { event.preventDefault(); void send("/api/brand/settings", "POST", new FormData(event.currentTarget), "Brand settings saved."); }} className="mt-4 grid gap-3 sm:grid-cols-2">
              {([["legal_name", "Legal name", "text"], ["address", "Address", "text"], ["phone", "Phone", "tel"], ["contact_email", "Contact email", "email"]] as const).map(([name, label, type]) =>
                <label key={name} className="text-sm font-medium">{label}<input required type={type} name={name} defaultValue={brand[name] ?? ""} maxLength={500} className={`${input} mt-1`} /></label>)}
              {(["primary_color", "secondary_color"] as const).map((name) =>
                <label key={name} className="text-sm font-medium capitalize">{name.replace("_", " ")}<input name={name} type="color" defaultValue={brand[name] || "#111827"} className="mt-1 block h-10 w-20" /></label>)}
              <label className="text-sm font-medium sm:col-span-2">Upload logo (PNG, JPEG or WebP, max 2 MB)<input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className={`${input} mt-1`} /></label>
              <button disabled={busy} className={`${button} sm:col-span-2`}>Save settings</button>
            </form>
          </section>

          <section className={panel}>
            <h2 className="text-xl font-semibold">Branches</h2>
            <div className="mt-4 space-y-3">
              {shops.map((shop) => <div key={shop.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold">{shop.name} <span className="text-xs font-normal text-zinc-500">({shop.is_active ? "Active" : "Inactive"})</span></p>
                    <p className="text-sm text-zinc-500">{shop.branch_code || "No branch code"} · {shop.address || "No address"} · {shop.manager_count} managers</p></div>
                  <div className="flex gap-2">
                    <button className="text-sm font-medium text-indigo-700" onClick={() => setBranch({ id: shop.id, name: shop.name, slug: shop.slug, branchCode: shop.branch_code ?? "", address: shop.address ?? "", isActive: shop.is_active })}>Edit</button>
                    <button disabled={busy} className="text-sm font-medium text-indigo-700 disabled:opacity-50" onClick={() => void send("/api/brand/branches", "POST", { id: shop.id, name: shop.name, slug: shop.slug, branchCode: shop.branch_code, address: shop.address, isActive: !shop.is_active }, "Branch status updated.")}>{shop.is_active ? "Deactivate" : "Activate"}</button>
                  </div>
                </div>
              </div>)}
            </div>
            <form onSubmit={saveBranch} className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
              <h3 className="font-semibold sm:col-span-2">{branch.id ? "Edit branch" : "Create branch"}</h3>
              <input required placeholder="Branch name" aria-label="Branch name" className={input} value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
              <input required placeholder="Slug (lowercase-hyphenated)" aria-label="Branch slug" className={input} value={branch.slug} onChange={(e) => setBranch({ ...branch, slug: e.target.value })} />
              <input placeholder="Branch code" aria-label="Branch code" className={input} value={branch.branchCode} onChange={(e) => setBranch({ ...branch, branchCode: e.target.value })} />
              <input placeholder="Branch address" aria-label="Branch address" className={input} value={branch.address} onChange={(e) => setBranch({ ...branch, address: e.target.value })} />
              <button disabled={busy} className={button}>{branch.id ? "Save branch" : "Add branch"}</button>
              {branch.id && <button type="button" className="text-sm text-zinc-600" onClick={() => setBranch(blankBranch)}>Cancel edit</button>}
            </form>
          </section>

          <section className={panel}>
            <h2 className="text-xl font-semibold">Shop managers</h2>
            <p className="mt-1 text-sm text-zinc-500">Deactivation only removes access to this brand. Shared-account passwords cannot be reset here.</p>
            <div className="mt-4 space-y-3">
              {managers.map((item) => <ManagerRow key={item.id} manager={item} shops={shops} busy={busy} send={send} />)}
              {!managers.length && <p className="text-sm text-zinc-500">No managers yet.</p>}
            </div>
            <form onSubmit={saveManager} className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
              <h3 className="font-semibold sm:col-span-2">Create manager</h3>
              <input required type="email" placeholder="Email" aria-label="Manager email" className={input} value={manager.email} onChange={(e) => setManager({ ...manager, email: e.target.value })} />
              <input required type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="Initial password (12+ characters)" aria-label="Initial password" className={input} value={manager.password} onChange={(e) => setManager({ ...manager, password: e.target.value })} />
              <select required aria-label="Manager branch" className={input} value={manager.shopId} onChange={(e) => setManager({ ...manager, shopId: e.target.value })}>
                <option value="">Select a branch</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
              </select>
              <button disabled={busy || !shops.length} className={button}>Create manager</button>
            </form>
          </section>

          <section className={panel}>
            <h2 className="text-xl font-semibold">Audit log</h2>
            <form onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ ...filters }); }} className="mt-4 grid gap-2 sm:grid-cols-2">
              <select aria-label="Filter branch" className={input} value={filters.shopId} onChange={(e) => setFilters({ ...filters, shopId: e.target.value })}><option value="">All branches</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
              <input placeholder="Event type (e.g. point_earn)" aria-label="Filter event type" className={input} value={filters.eventType} onChange={(e) => setFilters({ ...filters, eventType: e.target.value })} />
              <label className="text-sm">From (UTC)<input type="date" className={input} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
              <label className="text-sm">To (UTC)<input type="date" className={input} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
              <button className={`${button} sm:col-span-2`}>Apply filters</button>
            </form>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-zinc-200"><th className="p-2">Time</th><th className="p-2">Event</th><th className="p-2">Branch</th><th className="p-2">Actor</th><th className="p-2">Details</th></tr></thead>
              <tbody>{audit.logs.map((log) => <tr key={log.id} className="border-b border-zinc-100"><td className="whitespace-nowrap p-2">{new Date(log.created_at).toLocaleString()}</td><td className="p-2">{log.event_type}</td><td className="p-2">{shops.find((s) => s.id === log.shop_id)?.name ?? "—"}</td><td className="p-2">{log.actor_email ?? "—"}</td><td className="p-2"><details><summary className="cursor-pointer">View</summary><pre className="max-w-80 whitespace-pre-wrap break-all">{JSON.stringify(log.metadata, null, 2)}</pre></details></td></tr>)}</tbody></table>
              {!audit.logs.length && <p className="p-3 text-sm text-zinc-500">No matching events.</p>}
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button disabled={audit.page === 0} onClick={() => void loadAudit(audit.page - 1).catch((e) => setError(e.message))} className="text-indigo-700 disabled:opacity-40">Previous</button>
              <span>{audit.page + 1} · {audit.count} events</span>
              <button disabled={(audit.page + 1) * 50 >= audit.count} onClick={() => void loadAudit(audit.page + 1).catch((e) => setError(e.message))} className="text-indigo-700 disabled:opacity-40">Next</button>
            </div>
          </section>
        </div>
        <details className={panel}><summary className="cursor-pointer font-semibold">Rewards, sign-up QR and additional brands</summary><MerchantDashboard /></details>
      </div>
    </main>
  );
}

function ManagerRow({ manager, shops, busy, send }: {
  manager: Manager; shops: Branch[]; busy: boolean;
  send: (url: string, method: string, body: object, success: string) => Promise<boolean>;
}) {
  const [shopId, setShopId] = useState(manager.assigned_shop_id);
  const [password, setPassword] = useState("");
  return <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
    <p className="font-semibold">{manager.email} <span className="text-xs font-normal text-zinc-500">({manager.is_active ? "Active" : "Inactive"})</span></p>
    <div className="flex flex-wrap gap-2">
      <select aria-label={`Branch for ${manager.email}`} className={`${input} flex-1`} value={shopId} onChange={(e) => setShopId(e.target.value)}>
        {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
      </select>
      <button disabled={busy || shopId === manager.assigned_shop_id} className={button} onClick={() => void send("/api/brand/managers", "PATCH", { id: manager.id, shopId, isActive: manager.is_active }, "Manager reassigned.")}>Reassign</button>
      <button disabled={busy} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        onClick={() => void send("/api/brand/managers", "PATCH", { id: manager.id, shopId: manager.assigned_shop_id, isActive: !manager.is_active }, "Manager status updated.")}>
        {manager.is_active ? "Deactivate" : "Activate"}
      </button>
    </div>
    <form className="flex gap-2" onSubmit={(event) => {
      event.preventDefault();
      void send("/api/brand/managers", "PATCH", { id: manager.id, action: "password", password }, "Password reset.").then((ok) => { if (ok) setPassword(""); });
    }}>
      <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" aria-label={`New password for ${manager.email}`} placeholder="New password (12+ characters)" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={busy} className={button}>Reset</button>
    </form>
  </div>;
}
