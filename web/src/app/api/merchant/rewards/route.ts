import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Reward, Shop } from "@/types/loyalty";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const validPoints = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1_000_000;
const validTitle = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= 100;

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

async function ownsShop(shopId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("shops")
    .select("owner_user_id")
    .eq("id", shopId)
    .maybeSingle<Pick<Shop, "owner_user_id">>();
  return { exists: !!data, owned: data?.owner_user_id === userId };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  const body = await parseBody(request);
  if (!body) return fail("Invalid JSON body.", 400);

  const { shopId, title, points_required: pointsRequired } = body;
  if (typeof shopId !== "string" || !shopId) return fail("shopId is required.", 400);
  if (!validTitle(title)) return fail("title is required (max 100 characters).", 400);
  if (!validPoints(pointsRequired)) return fail("points_required must be a positive integer.", 400);

  const { exists, owned } = await ownsShop(shopId, user.id);
  if (!exists) return fail("Shop not found.", 404);
  if (!owned) return fail("Forbidden.", 403);

  const { data, error } = await createSupabaseAdminClient()
    .from("rewards")
    .insert({ shop_id: shopId, title: title.trim(), points_required: pointsRequired, is_active: true })
    .select("*")
    .single<Reward>();
  if (error) return fail("Could not create reward.", 500);

  return NextResponse.json({ reward: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  const body = await parseBody(request);
  if (!body) return fail("Invalid JSON body.", 400);

  const { rewardId } = body;
  if (typeof rewardId !== "string" || !rewardId) return fail("rewardId is required.", 400);

  const updates: Partial<Pick<Reward, "title" | "points_required" | "is_active">> = {};
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return fail("is_active must be a boolean.", 400);
    updates.is_active = body.is_active;
  }
  if ("title" in body) {
    if (!validTitle(body.title)) return fail("title must be 1-100 characters.", 400);
    updates.title = body.title.trim();
  }
  if ("points_required" in body) {
    if (!validPoints(body.points_required)) return fail("points_required must be a positive integer.", 400);
    updates.points_required = body.points_required;
  }
  if (Object.keys(updates).length === 0) return fail("Nothing to update.", 400);

  const supabase = createSupabaseAdminClient();
  const { data: reward } = await supabase
    .from("rewards")
    .select("shop_id")
    .eq("id", rewardId)
    .maybeSingle<Pick<Reward, "shop_id">>();
  if (!reward) return fail("Reward not found.", 404);

  const { owned } = await ownsShop(reward.shop_id, user.id);
  if (!owned) return fail("Forbidden.", 403);

  const { data, error } = await supabase
    .from("rewards")
    .update(updates)
    .eq("id", rewardId)
    .select("*")
    .single<Reward>();
  if (error) return fail("Could not update reward.", 500);

  return NextResponse.json({ reward: data });
}
