import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Customer, LoyaltyCard, PointTransaction, Reward, Shop } from "@/types/loyalty";

export async function GET(_request: Request, { params }: { params: Promise<{ cardCode: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { cardCode: rawCode } = await params;
  const cardCode = decodeURIComponent(rawCode).trim();

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data: card, error } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("card_code", cardCode)
    .maybeSingle<LoyaltyCard>();
  if (error) return NextResponse.json({ error: "Could not load card." }, { status: 500 });
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("*")
    .eq("id", card.shop_id)
    .single<Shop>();
  if (shopError || !shop) return NextResponse.json({ error: "Could not load card details." }, { status: 500 });
  if (shop.owner_user_id !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const [customerRes, rewardsRes, txRes] = await Promise.all([
    supabase.from("customers").select("*").eq("id", card.customer_id).single<Customer>(),
    supabase
      .from("rewards")
      .select("*")
      .eq("shop_id", card.shop_id)
      .eq("is_active", true)
      .order("points_required", { ascending: true })
      .returns<Reward[]>(),
    supabase
      .from("point_transactions")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<PointTransaction[]>(),
  ]);

  if (customerRes.error || rewardsRes.error || txRes.error) {
    return NextResponse.json({ error: "Could not load card details." }, { status: 500 });
  }

  return NextResponse.json({
    card,
    customer: customerRes.data,
    shop,
    rewards: rewardsRes.data ?? [],
    transactions: txRes.data ?? [],
  });
}
