import "server-only";
import { isUuid } from "@/lib/brand-admin";

export class ReportFilterError extends Error {}

function dateBound(value: string | null, end: boolean): string | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) throw new ReportFilterError("Invalid date.");
  const day = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.getUTCFullYear() < 1 || day.toISOString().slice(0, 10) !== datePart) throw new ReportFilterError("Invalid date.");
  if (value === datePart) {
    if (end) day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCFullYear() > 9999) throw new ReportFilterError("Invalid date.");
    return day.toISOString().replace(".000Z", ".000000Z");
  }
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(value)) {
    throw new ReportFilterError("Date/time must include a UTC offset.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new ReportFilterError("Invalid date/time.");
  const fraction = value.match(/\.(\d{1,6})(?=Z|[+-]\d{2}:\d{2}$)/)?.[1] ?? "";
  return date.toISOString().replace(/\.\d{3}Z$/, `.${fraction.padEnd(6, "0")}Z`);
}

export function reportFilters(params: URLSearchParams) {
  const shop = params.get("shop_id") || null;
  const from = dateBound(params.get("from"), false);
  const to = dateBound(params.get("to"), true);
  const pageText = params.get("page") || "0";
  if ((shop && !isUuid(shop)) || !/^\d{1,5}$/.test(pageText) || Number(pageText) > 10000 || (from && to && from >= to)) {
    throw new ReportFilterError("Invalid report filters.");
  }
  return { shop, from, to, page: Number(pageText) };
}

export function textFilter(value: string | null): string | null {
  const text = value?.trim() || null;
  if (text && text.length > 200) throw new ReportFilterError("Search text is too long.");
  return text;
}

export interface ReportTransaction {
  id: string;
  created_at: string;
  branch_name: string;
  customer_name: string;
  customer_email: string | null;
  card_code: string;
  bill_reference: string | null;
  purchase_amount: string | null;
  currency: string | null;
  type: string;
  points_delta: number;
  performed_by: string | null;
  processed_by: string | null;
}

export interface ReportRows<T> { rows: T[]; count: number }
