import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { canScanShop } from "@/lib/brand-access";
import type {
  LoyaltyCard,
  Shop,
  ProcessLoyaltyTransactionResult,
  Reward,
  TransactionType,
} from "@/types/loyalty";

const TYPES: TransactionType[] = ["earn", "redeem", "adjust"];

// Non-success statuses and the HTTP code they map to.
const STATUS_CODES: Record<string, number> = {
  card_not_found: 404,
  card_not_active: 409,
  insufficient_points: 409,
  invalid_type: 400,
  idempotency_conflict: 409,
  forbidden: 403,
  branch_not_active: 409,
  invalid_reward: 400,
  invalid_purchase_amount: 400,
  purchase_details_required: 400,
  duplicate_bill_reference: 409,
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Invalid JSON body.", 400);
  const body = input as Record<string, unknown>;

  const cardCode = typeof body.cardCode === "string" ? body.cardCode.trim() : "";
  const type = body.type as TransactionType;
  const pointsDelta = body.pointsDelta;
  const rewardId = typeof body.rewardId === "string" && body.rewardId ? body.rewardId : null;
  const suppliedKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const rawAmount = typeof body.purchaseAmount === "string" ? body.purchaseAmount.trim() :
    typeof body.purchaseAmount === "number" && Number.isFinite(body.purchaseAmount) ? String(body.purchaseAmount) : "";
  const billReference = typeof body.billReference === "string" ? body.billReference.trim() : "";

  if (!cardCode) return fail("cardCode is required.", 400);
  if (!TYPES.includes(type)) return fail("type must be earn, redeem or adjust.", 400);
  if (typeof pointsDelta !== "number" || !Number.isInteger(pointsDelta) || pointsDelta === 0) {
    return fail("pointsDelta must be a non-zero integer.", 400);
  }
  if (Math.abs(pointsDelta) > 100000) return fail("pointsDelta is too large.", 400);
  if (type === "earn" && pointsDelta < 0) return fail("Earn requires a positive pointsDelta.", 400);
  if (type === "redeem" && pointsDelta > 0) return fail("Redeem requires a negative pointsDelta.", 400);
  if (type === "earn" && (!suppliedKey || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(rawAmount) ||
      Number(rawAmount) <= 0 || !billReference || billReference.length > 200)) {
    return fail("A positive EUR purchase amount, bill reference and idempotency key are required.", 400);
  }
  if (type !== "earn" && (body.purchaseAmount != null || body.billReference != null)) {
    return fail("Purchase details apply only when awarding points.", 400);
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    console.error(e);
    return fail("Server is not configured.", 500);
  }

  const { data: card, error: cardError } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("card_code", cardCode)
    .maybeSingle<LoyaltyCard>();
  if (cardError) return fail("Could not load card.", 500);
  if (!card) return fail("Card not found.", 404);

  if (body.shopId !== undefined && (typeof body.shopId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.shopId.trim()))) {
    return fail("shopId must be a valid UUID.", 400);
  }
  const shopId = typeof body.shopId === "string" ? body.shopId.trim() : card.shop_id;
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle<Shop>();
  if (shopError) return fail("Could not load branch.", 500);
  if (!shop || !await canScanShop(user.id, shop)) return fail("Forbidden.", 403);
  if (!shop.is_active) return fail("Branch is not active.", 409);

  if (shop.brand_id) {
    if (!suppliedKey) return fail("idempotencyKey is required.", 400);
    const { data, error } = await supabase.rpc("process_brand_scan", {
      p_user_id: user.id,
      p_shop_id: shop.id,
      p_card_code: cardCode,
      p_type: type,
      p_delta: pointsDelta,
      p_idempotency_key: suppliedKey,
      p_reward_id: rewardId,
      p_note: note,
      p_purchase_amount: type === "earn" ? rawAmount : 0,
      p_bill_reference: type === "earn" ? billReference : null,
    });
    if (error || !data) {
      console.error("[POST /api/transactions]", error);
      return fail("Could not process transaction.", 500);
    }
    if (typeof data.status !== "string" || !["success", "duplicate", ...Object.keys(STATUS_CODES)].includes(data.status)) {
      console.error("[POST /api/transactions] Unexpected RPC result", data);
      return fail("Could not process transaction.", 500);
    }
    const status = data.status === "success" || data.status === "duplicate" ? 200 : STATUS_CODES[data.status];
    if ((data.status === "success" || data.status === "duplicate") && !Array.isArray(data.issued_vouchers)) {
      console.error("[POST /api/transactions] Missing issued vouchers", data);
      return fail("Could not process transaction.", 500);
    }
    return NextResponse.json({
      status: data.status, card_id: data.card_id ?? null, new_balance: data.new_balance ?? null,
      purchase_at: data.purchase_at ?? null, issued_vouchers: data.issued_vouchers ?? [],
    }, { status });
  }

  if (card.shop_id !== shop.id) return fail("Card belongs to a different shop.", 403);

  if (type === "earn") {
    const { data, error } = await supabase.rpc("slice2d_unbranded_purchase", {
      p_user_id: user.id, p_shop_id: shop.id, p_card_code: cardCode, p_delta: pointsDelta,
      p_idempotency_key: suppliedKey, p_note: note, p_purchase_amount: rawAmount, p_bill_reference: billReference,
    });
    if (error || !data || typeof data.status !== "string" || !["success", "duplicate", ...Object.keys(STATUS_CODES)].includes(data.status)) {
      console.error("[POST /api/transactions] Unbranded purchase failed", error ?? data);
      return fail("Could not process transaction.", 500);
    }
    const status = data.status === "success" || data.status === "duplicate" ? 200 : STATUS_CODES[data.status];
    return NextResponse.json(data, { status });
  }

  if (type === "redeem") {
    if (!rewardId) return fail("rewardId is required for redemptions.", 400);
    const { data: reward, error: rewardError } = await supabase.from("rewards").select("*").eq("id", rewardId).maybeSingle<Reward>();
    if (rewardError) return fail("Could not load reward.", 500);
    if (!reward || reward.shop_id !== card.shop_id || !reward.is_active) {
      return fail("Reward is not available for this card.", 400);
    }
    if (pointsDelta !== -reward.points_required) {
      return fail("pointsDelta does not match the reward cost.", 400);
    }
  }

  const { data, error } = await supabase.rpc("process_loyalty_transaction", {
    p_card_code: cardCode,
    p_type: type,
    p_points_delta: pointsDelta,
    p_reward_id: rewardId ?? null,
    p_idempotency_key: suppliedKey || crypto.randomUUID(),
    p_note: note ?? null,
    p_performed_by: user.id,
  });
  if (error || !data) {
    console.error(error);
    return fail("Could not process transaction.", 500);
  }

  const result = data as ProcessLoyaltyTransactionResult;
  const httpStatus = result.status === "success" || result.status === "duplicate" ? 200 : (STATUS_CODES[result.status] ?? 400);
  return NextResponse.json(
    { status: result.status, card_id: result.card_id, new_balance: result.new_balance },
    { status: httpStatus }
  );
}
