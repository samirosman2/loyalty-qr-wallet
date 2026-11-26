import { connection, NextResponse } from "next/server";
import { requireBrandOwner, errorResponse, isUuid } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  await connection();
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const params = new URL(request.url).searchParams;
    const shopId = params.get("shopId");
    const eventType = params.get("eventType");
    const from = params.get("from");
    const to = params.get("to");
    const page = Number(params.get("page") ?? "0");
    if ((shopId && !isUuid(shopId)) || (eventType && !/^[a-z_]{1,60}$/.test(eventType)) ||
      !Number.isInteger(page) || page < 0 || page > 10000 ||
      (from && !validDate(from)) || (to && !validDate(to)) ||
      (from && to && from > to)) return NextResponse.json({ error: "Invalid audit filters." }, { status: 400 });
    let query = createSupabaseAdminClient().from("audit_logs")
      .select("id, shop_id, actor_email, event_type, metadata, created_at", { count: "exact" })
      .eq("brand_id", access.brandId);
    if (shopId) query = query.eq("shop_id", shopId);
    if (eventType) query = query.eq("event_type", eventType);
    if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
    if (to) {
      const end = new Date(`${to}T00:00:00Z`);
      if (Number.isNaN(end.getTime())) return NextResponse.json({ error: "Invalid audit date." }, { status: 400 });
      end.setUTCDate(end.getUTCDate() + 1);
      query = query.lt("created_at", end.toISOString());
    }
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 50, page * 50 + 49);
    if (error || count === null) throw error ?? new Error("Could not count audit entries.");
    return NextResponse.json({ logs: data, count, page });
  } catch (error) { return errorResponse(error, "[GET /api/brand/audit]"); }
}
