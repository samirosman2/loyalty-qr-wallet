"use client";

import { useEffect, useState, type FormEvent } from "react";

type Branch = { id: string; name: string };
type Filters = { shop_id: string; from: string; to: string };
type CustomerFilters = Filters & { min_visits: string; min_spend: string; q: string };
type TransactionFilters = Filters & { bill_reference: string; type: string };
type Customer = { id: string; full_name: string; email: string | null; card_codes: string[]; visit_count: number; total_spent: string; points_balance: number; active_vouchers: number; redeemed_vouchers: number; last_visit: string | null };
type Transaction = { id: string; created_at: string; branch_name: string; customer_name: string; bill_reference: string | null; purchase_amount: string | null; currency: string | null; type: string; points_delta: number; processed_by: string | null; performed_by: string | null };
type Event = { id: string; created_at: string; kind: string; branch_name: string | null; bill_reference: string | null; purchase_amount: string | null; currency: string | null; type: string | null; points_delta: number | null; voucher_description: string | null };
type Page<T> = { rows: T[]; count: number; page: number };
const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const panel = "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200";
const base = { shop_id: "", from: "", to: "" };

function query(filters: object, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    params.set(key, key === "from" || key === "to" ? new Date(value).toISOString() : value);
  }
  params.set("page", String(page));
  return params;
}

function useReport<T>(url: string) {
  const [result, setResult] = useState<{ url: string; data: Page<T> | null; error: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load report.");
      setResult({ url, data: json, error: "" });
    }).catch((err) => { if (!controller.signal.aborted) setResult({ url, data: null, error: err instanceof Error ? err.message : "Could not load report." }); });
    return () => controller.abort();
  }, [url]);
  return result?.url === url ? result : { data: null, error: "" };
}

function BranchAndDates({ shops, filters, set }: { shops: Branch[]; filters: Filters; set: (value: Filters) => void }) {
  return <>
    <label className="text-sm">Branch<select className={input} value={filters.shop_id} onChange={(e) => set({ ...filters, shop_id: e.target.value })}><option value="">All branches</option>{shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.name}</option>)}</select></label>
    <label className="text-sm">From (local time, inclusive)<input className={input} type="datetime-local" value={filters.from} onChange={(e) => set({ ...filters, from: e.target.value })} /></label>
    <label className="text-sm">To (local time, exclusive)<input className={input} type="datetime-local" value={filters.to} onChange={(e) => set({ ...filters, to: e.target.value })} /></label>
  </>;
}

function Pagination({ page, count, setPage }: { page: number; count: number; setPage: (page: number) => void }) {
  return <div className="mt-3 flex items-center gap-3 text-sm">
    <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="text-indigo-700 disabled:opacity-40">Previous</button>
    <span>Page {page + 1} · {count} records</span>
    <button type="button" disabled={(page + 1) * 50 >= count || page >= 10000} onClick={() => setPage(page + 1)} className="text-indigo-700 disabled:opacity-40">Next</button>
  </div>;
}

function CustomerLedger({ customer, filters }: { customer: Customer; filters: CustomerFilters }) {
  const [page, setPage] = useState(0);
  const params = query({ shop_id: filters.shop_id, from: filters.from, to: filters.to, customer_id: customer.id }, page);
  const { data, error } = useReport<Event>(`/api/brand/reports/customers?${params}`);
  return <div className="mt-4 rounded-xl border border-zinc-200 p-4">
    <h3 className="font-semibold">{customer.full_name} · activity</h3>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p>Loading activity…</p>}
    {data && <><div className="overflow-x-auto"><table className="mt-2 w-full text-left text-sm"><thead><tr>{["Timestamp", "Branch", "Activity", "Bill", "Amount", "Points", "Voucher"].map((title) => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>
      {data.rows.map((row) => <tr key={`${row.kind}-${row.id}`} className="border-t border-zinc-100"><td className="whitespace-nowrap p-2">{row.created_at}</td><td className="p-2">{row.branch_name ?? "—"}</td><td className="p-2">{row.type ?? row.kind.replace("_", " ")}</td><td className="p-2">{row.bill_reference ?? "—"}</td><td className="p-2">{row.purchase_amount === null ? "—" : `${row.purchase_amount} ${row.currency ?? ""}`}</td><td className="p-2">{row.points_delta ?? "—"}</td><td className="p-2">{row.voucher_description ?? "—"}</td></tr>)}
    </tbody></table>{!data.rows.length && <p className="p-2 text-sm text-zinc-500">No matching activity.</p>}</div><Pagination page={page} count={data.count} setPage={setPage} /></>}
  </div>;
}

function CustomerAnalytics({ shops }: { shops: Branch[] }) {
  const [filters, setFilters] = useState<CustomerFilters>({ ...base, min_visits: "", min_spend: "", q: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);
  const { data, error } = useReport<Customer>(`/api/brand/reports/customers?${query(applied, page)}`);
  function apply(event: FormEvent) { event.preventDefault(); setPage(0); setSelected(null); setApplied({ ...filters }); }
  return <section className={panel}>
    <h2 className="text-xl font-semibold">Customer Analytics</h2>
    <p className="mt-1 text-sm text-zinc-500">Visits and EUR spend reflect the selected branch and period. Current points and voucher counts are brand-wide. Filtered results include customers with activity in the period.</p>
    <form onSubmit={apply} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BranchAndDates shops={shops} filters={filters} set={(value) => setFilters({ ...filters, ...value })} />
      <label className="text-sm">Minimum visits<input type="number" min="0" max="999999999" step="1" className={input} value={filters.min_visits} onChange={(e) => setFilters({ ...filters, min_visits: e.target.value })} /></label>
      <label className="text-sm">Minimum spend (EUR)<input type="number" min="0" step="0.01" className={input} value={filters.min_spend} onChange={(e) => setFilters({ ...filters, min_spend: e.target.value })} /></label>
      <label className="text-sm">Name, email or card code<input maxLength={200} className={input} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
      <button className={button}>Apply filters</button>
    </form>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {!data && !error && <p className="mt-3">Loading customers…</p>}
    {data && <><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Customer", "Email", "Card code(s)", "Visits", "Spent (EUR)", "Points", "Vouchers active / redeemed", "Last visit (UTC)"].map((title) => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.id} onClick={() => setSelected(selected?.id === row.id ? null : row)} className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"><td className="p-2"><button type="button" onClick={(event) => { event.stopPropagation(); setSelected(selected?.id === row.id ? null : row); }} className="text-left font-medium text-indigo-700 underline" aria-expanded={selected?.id === row.id}>{row.full_name}</button></td><td className="p-2">{row.email ?? "—"}</td><td className="p-2">{row.card_codes.join(", ")}</td><td className="p-2">{row.visit_count}</td><td className="p-2">{row.total_spent}</td><td className="p-2">{row.points_balance}</td><td className="p-2">{row.active_vouchers} / {row.redeemed_vouchers}</td><td className="whitespace-nowrap p-2">{row.last_visit ?? "—"}</td></tr>)}
    </tbody></table>{!data.rows.length && <p className="p-2 text-sm text-zinc-500">No matching customers.</p>}</div><Pagination page={page} count={data.count} setPage={(next) => { setSelected(null); setPage(next); }} /></>}
    {selected && <CustomerLedger key={`${selected.id}-${JSON.stringify(applied)}`} customer={selected} filters={applied} />}
  </section>;
}

function AccountingLedger({ shops }: { shops: Branch[] }) {
  const [filters, setFilters] = useState<TransactionFilters>({ ...base, bill_reference: "", type: "" });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const { data, error } = useReport<Transaction>(`/api/brand/reports/transactions?${query(applied, page)}`);
  async function exportCsv() {
    setExporting(true); setExportError("");
    try {
      const params = query(applied, 0); params.set("format", "csv");
      const response = await fetch(`/api/brand/reports/transactions?${params}`);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "Could not export ledger."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "transactions.csv"; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setExportError(err instanceof Error ? err.message : "Could not export ledger."); }
    finally { setExporting(false); }
  }
  return <section className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Transactions &amp; Accounting Ledger</h2><button type="button" disabled={exporting || !data} onClick={() => void exportCsv()} className={button}>{exporting ? "Exporting…" : "Export CSV"}</button></div>
    <p className="mt-1 text-sm text-zinc-500">Export uses the applied filters, includes all matching rows, and uses UTC timestamps.</p>
    <form onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied({ ...filters }); }} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BranchAndDates shops={shops} filters={filters} set={(value) => setFilters({ ...filters, ...value })} />
      <label className="text-sm">Bill reference<input maxLength={200} className={input} value={filters.bill_reference} onChange={(e) => setFilters({ ...filters, bill_reference: e.target.value })} /></label>
      <label className="text-sm">Transaction type<select className={input} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All types</option><option value="earn">Earn</option><option value="redeem">Redeem</option><option value="adjust">Adjust</option></select></label>
      <button className={`${button} self-end`}>Apply filters</button>
    </form>
    {(error || exportError) && <p role="alert" className="mt-3 text-red-700">{error || exportError}</p>}
    {!data && !error && <p className="mt-3">Loading transactions…</p>}
    {data && <><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Timestamp (UTC)", "Branch", "Customer", "Bill reference", "Amount", "Type", "Points", "Processed by"].map((title) => <th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.id} className="border-t border-zinc-100"><td className="whitespace-nowrap p-2">{row.created_at}</td><td className="p-2">{row.branch_name}</td><td className="p-2">{row.customer_name}</td><td className="p-2">{row.bill_reference ?? "—"}</td><td className="p-2">{row.purchase_amount === null ? "—" : `${row.purchase_amount} ${row.currency ?? ""}`}</td><td className="p-2">{row.type}</td><td className="p-2">{row.points_delta}</td><td className="p-2">{row.processed_by ?? row.performed_by ?? "—"}</td></tr>)}
    </tbody></table>{!data.rows.length && <p className="p-2 text-sm text-zinc-500">No matching transactions.</p>}</div><Pagination page={page} count={data.count} setPage={setPage} /></>}
  </section>;
}

export default function BrandReports({ shops }: { shops: Branch[] }) {
  return <><CustomerAnalytics shops={shops} /><AccountingLedger shops={shops} /></>;
}
