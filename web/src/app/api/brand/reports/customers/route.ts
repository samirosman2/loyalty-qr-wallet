import { connection, NextResponse } from "next/server";
import { errorResponse, isUuid, requireBrandOwner } from "@/lib/brand-admin";
import { ReportFilterError, reportFilters, textFilter } from "@/lib/brand-reports";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await connection();
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const params = new URL(request.url).searchParams;
    const { shop, from, to, page } = reportFilters(params);
    const customer = params.get("customer_id");
    const supabase = createSupabaseAdminClient();
    let result;
    if (customer) {
      if (!isUuid(customer)) throw new ReportFilterError("Invalid customer.");
      result = await supabase.rpc("slice2e_customer_ledger", {
        p_brand_id: access.brandId, p_user_id: access.user.id, p_customer_id: customer,
        p_shop_id: shop, p_from: from, p_to: to, p_page: page, p_limit: 50,
      });
    } else {
      const visits = params.get("min_visits") || "0";
      const spend = params.get("min_spend") || "0";
      if (!/^\d{1,9}$/.test(visits) || !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(spend)) throw new ReportFilterError("Invalid minimum visits or spend.");
      result = await supabase.rpc("slice2e_customers", {
        p_brand_id: access.brandId, p_user_id: access.user.id, p_shop_id: shop,
        p_from: from, p_to: to, p_min_visits: Number(visits), p_min_spend: spend,
        p_search: textFilter(params.get("q")), p_page: page, p_limit: 50,
      });
    }
    if (result.error) throw result.error;
    if (result.data === null) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (result.data.status === "not_found") return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    if (!Array.isArray(result.data.rows) || typeof result.data.count !== "number") throw new Error("Unexpected customer report result.");
    return NextResponse.json({ ...result.data, page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ReportFilterError) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error, "[GET /api/brand/reports/customers]");
  }
}
