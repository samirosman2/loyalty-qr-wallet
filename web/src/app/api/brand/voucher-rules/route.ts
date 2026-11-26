import { connection, NextResponse } from "next/server";
import { requireBrandOwner, errorResponse, isUuid } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { SpendVoucherRule } from "@/types/loyalty";

function decimal(value: unknown): string | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text) ? text : null;
}

export async function GET() {
  await connection();
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const rules: SpendVoucherRule[] = [];
    const supabase = createSupabaseAdminClient();
    for (;;) {
      const from = rules.length;
      const { data, error, count } = await supabase.from("spend_voucher_rules")
        .select("id, name, min_spend_amount, window_days, discount_type, discount_value, voucher_valid_days, is_active", { count: "exact" })
        .eq("brand_id", access.brandId).order("created_at", { ascending: false }).order("id").range(from, from + 999).returns<SpendVoucherRule[]>();
      if (error) throw error;
      if (count === null || (!data.length && from < count)) throw new Error("Could not retrieve all voucher rules.");
      rules.push(...data);
      if (rules.length >= count) break;
    }
    return NextResponse.json({ rules });
  } catch (error) { return errorResponse(error, "[GET /api/brand/voucher-rules]"); }
}

export async function POST(request: Request) {
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid rule." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const minimum = decimal(input.min_spend_amount);
    const value = decimal(input.discount_value);
    if ((input.id != null && !isUuid(input.id)) || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 ||
      minimum === null || value === null || Number(value) <= 0 ||
      (input.discount_type !== "percent" && input.discount_type !== "fixed") ||
      (input.discount_type === "percent" && Number(value) > 100) ||
      typeof input.window_days !== "number" || !Number.isInteger(input.window_days) || input.window_days < 1 || input.window_days > 3650 ||
      typeof input.voucher_valid_days !== "number" || !Number.isInteger(input.voucher_valid_days) || input.voucher_valid_days < 1 || input.voucher_valid_days > 3650 ||
      typeof input.is_active !== "boolean") {
      return NextResponse.json({ error: "Enter valid rule details, amounts and day limits." }, { status: 400 });
    }
    const { data, error } = await createSupabaseAdminClient().rpc("slice2d_save_voucher_rule", {
      p_brand_id: access.brandId, p_user_id: access.user.id, p_actor_email: access.user.email ?? null,
      p_rule_id: input.id ?? null, p_name: input.name.trim(), p_min_spend: minimum, p_window_days: input.window_days,
      p_discount_type: input.discount_type, p_discount_value: value, p_valid_days: input.voucher_valid_days, p_is_active: input.is_active,
    });
    if (error) throw error;
    if (data?.status !== "success") return NextResponse.json({ error: "Could not save rule." }, { status: data?.status === "forbidden" ? 403 : 400 });
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error, "[POST /api/brand/voucher-rules]"); }
}
