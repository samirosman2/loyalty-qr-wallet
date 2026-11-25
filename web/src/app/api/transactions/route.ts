import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
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
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const cardCode = typeof body.cardCode === "string" ? body.cardCode.trim() : "";
  const type = body.type as TransactionType;
  const pointsDelta = body.pointsDelta;
  const rewardId = typeof body.rewardId === "string" && body.rewardId ? body.rewardId : null;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : crypto.randomUUID();
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (!cardCode) return fail("cardCode is required.", 400);
  if (!TYPES.includes(type)) return fail("type must be earn, redeem or adjust.", 400);
  if (typeof pointsDelta !== "number" || !Number.isInteger(pointsDelta) || pointsDelta === 0) {
    return fail("pointsDelta must be a non-zero integer.", 400);
  }
  if (Math.abs(pointsDelta) > 100000) return fail("pointsDelta is too large.", 400);
  if (type === "earn" && pointsDelta < 0) return fail("Earn requires a positive pointsDelta.", 400);
  if (type === "redeem" && pointsDelta > 0) return fail("Redeem requires a negative pointsDelta.", 400);

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    console.error(e);
    return fail("Server is not configured.", 500);
  }

  const { data: card } = await supabase
    .from("loyalty_cards")
    .select("shop_id")
    .eq("card_code", cardCode)
    .maybeSingle<Pick<LoyaltyCard, "shop_id">>();
  if (!card) return fail("Card not found.", 404);

  const { data: shop } = await supabase
    .from("shops")
    .select("owner_user_id")
    .eq("id", card.shop_id)
    .maybeSingle<Pick<Shop, "owner_user_id">>();
  if (!shop || shop.owner_user_id !== user.id) return fail("Forbidden.", 403);

  if (type === "redeem") {
    if (!rewardId) return fail("rewardId is required for redemptions.", 400);
    const { data: reward } = await supabase.from("rewards").select("*").eq("id", rewardId).maybeSingle<Reward>();
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
    p_idempotency_key: idempotencyKey,
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
