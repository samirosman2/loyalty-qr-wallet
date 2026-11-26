import { connection, NextResponse } from "next/server";
import { errorResponse, requireBrandOwner } from "@/lib/brand-admin";
import { ReportFilterError, reportFilters, textFilter, type ReportRows, type ReportTransaction } from "@/lib/brand-reports";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function csvText(value: string | null): string {
  let text = value ?? "";
  if (/^\s*[\t\r\n=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: ReportTransaction[]): string {
  const header = ["Timestamp (UTC)", "Branch", "Customer", "Email", "Card code", "Bill reference", "Purchase amount", "Currency", "Transaction type", "Points delta", "Processed by"];
  return "\uFEFF" + [header.map(csvText).join(";"), ...rows.map((row) => [
    csvText(row.created_at), csvText(row.branch_name), csvText(row.customer_name), csvText(row.customer_email),
    csvText(row.card_code), csvText(row.bill_reference), row.purchase_amount === null ? "" : row.purchase_amount.replace(".", ","),
    csvText(row.currency), csvText(row.type), String(row.points_delta), csvText(row.processed_by ?? row.performed_by),
  ].join(";"))].join("\r\n") + "\r\n";
}

export async function GET(request: Request) {
  await connection();
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const params = new URL(request.url).searchParams;
    const { shop, from, to, page } = reportFilters(params);
    const type = params.get("type") || null;
    const format = params.get("format");
    if ((type && !["earn", "redeem", "adjust"].includes(type)) || (format && format !== "csv")) throw new ReportFilterError("Invalid transaction filters.");
    const { data, error } = await createSupabaseAdminClient().rpc("slice2e_transactions", {
      p_brand_id: access.brandId, p_user_id: access.user.id, p_shop_id: shop, p_from: from, p_to: to,
      p_bill: textFilter(params.get("bill_reference")), p_type: type, p_page: page, p_limit: 50, p_export: format === "csv",
    });
    if (error) throw error;
    if (data === null) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (!Array.isArray(data.rows) || typeof data.count !== "number") throw new Error("Unexpected transaction report result.");
    const result: ReportRows<ReportTransaction> = data;
    if (format === "csv") {
      if (result.rows.length !== result.count) throw new Error("Incomplete accounting export.");
      return new Response(csv(result.rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="transactions.csv"', "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ ...result, page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ReportFilterError) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error, "[GET /api/brand/reports/transactions]");
  }
}
