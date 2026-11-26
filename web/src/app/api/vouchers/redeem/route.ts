import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/brand-admin";
import { canScanShop } from "@/lib/brand-access";
import type { Shop } from "@/types/loyalty";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = input as Record<string, unknown>;
  if (!isUuid(body.shopId) || !isUuid(body.voucherId) || typeof body.cardCode !== "string" || !body.cardCode.trim()) {
    return NextResponse.json({ error: "Card, branch and voucher are required." }, { status: 400 });
  }
  try {
    const supabase = createSupabaseAdminClient();
    const branch = await supabase.from("shops").select("*").eq("id", body.shopId).maybeSingle<Shop>();
    if (branch.error) throw branch.error;
    if (!branch.data || !await canScanShop(user.id, branch.data)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const { data, error } = await supabase.rpc("slice2d_redeem_voucher", {
      p_user_id: user.id, p_shop_id: body.shopId, p_card_code: body.cardCode.trim(), p_voucher_id: body.voucherId,
    });
    if (error) throw error;
    const statuses: Record<string, number> = {
      success: 200, forbidden: 403, branch_not_active: 409, card_not_found: 404,
      card_not_active: 409, voucher_not_found: 404, voucher_not_active: 409, voucher_expired: 409,
    };
    if (!data || typeof data.status !== "string" || !(data.status in statuses)) throw new Error("Unexpected voucher redemption result.");
    return NextResponse.json(data, { status: statuses[data.status] });
  } catch (error) {
    console.error("[POST /api/vouchers/redeem]", error);
    return NextResponse.json({ error: "Could not redeem voucher." }, { status: 500 });
  }
}
