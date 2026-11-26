import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getBrandBalance, getShopRewards } from "@/lib/loyalty-data";
import type { Customer, LoyaltyCard, PointTransaction, Shop } from "@/types/loyalty";

export async function GET(request: Request, { params }: { params: Promise<{ cardCode: string }> }) {
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

  const { data: cardShop, error: cardShopError } = await supabase
    .from("shops")
    .select("*")
    .eq("id", card.shop_id)
    .single<Shop>();
  if (cardShopError || !cardShop) return NextResponse.json({ error: "Could not load card details." }, { status: 500 });

  const selectedShopId = new URL(request.url).searchParams.get("shopId") || card.shop_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedShopId)) {
    return NextResponse.json({ error: "shopId must be a valid UUID." }, { status: 400 });
  }
  const { data: shop, error: shopError } = await supabase
    .from("shops").select("*").eq("id", selectedShopId).maybeSingle<Shop>();
  if (shopError) return NextResponse.json({ error: "Could not load branch." }, { status: 500 });
  if (!shop) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  if (shop.owner_user_id !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!shop.is_active) return NextResponse.json({ error: "Branch is not active." }, { status: 409 });
  if (cardShop.brand_id ? cardShop.brand_id !== shop.brand_id : cardShop.id !== shop.id) {
    return NextResponse.json({ error: "This card belongs to a different brand." }, { status: 403 });
  }

  try {
    const [customerRes, rewards, txRes, balance] = await Promise.all([
      supabase.from("customers").select("*").eq("id", card.customer_id).single<Customer>(),
      getShopRewards(supabase, shop, true),
      supabase.from("point_transactions").select("*").eq("card_id", card.id)
        .order("created_at", { ascending: false }).limit(10).returns<PointTransaction[]>(),
      shop.brand_id ? getBrandBalance(supabase, shop.brand_id, card.customer_id) : Promise.resolve(card.points_balance),
    ]);

    if (customerRes.error || txRes.error) {
      return NextResponse.json({ error: "Could not load card details." }, { status: 500 });
    }

    return NextResponse.json({
      card: { ...card, points_balance: balance },
      customer: customerRes.data,
      shop,
      rewards,
      transactions: txRes.data ?? [],
    });
  } catch (error) {
    console.error("[GET /api/cards/[cardCode]]", error);
    return NextResponse.json({ error: "Could not load card details." }, { status: 500 });
  }
}
