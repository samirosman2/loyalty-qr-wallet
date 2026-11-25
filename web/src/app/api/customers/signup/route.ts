import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Customer, LoyaltyCard, Reward, Shop } from "@/types/loyalty";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCardCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `LC-${code}`;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const shopSlug = clean(body.shopSlug);
  const fullName = clean(body.fullName);
  const email = clean(body.email)?.toLowerCase() ?? null;
  const phone = clean(body.phone);

  if (!shopSlug || !fullName) return fail("shopSlug and fullName are required.", 400);
  if (!email && !phone) return fail("Provide an email or a phone number.", 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Invalid email address.", 400);

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    console.error(e);
    return fail("Server is not configured.", 500);
  }

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("*")
    .eq("slug", shopSlug)
    .maybeSingle<Shop>();
  if (shopError) return fail("Could not load shop.", 500);
  // The shops table has no active flag, so "active" means the shop exists.
  if (!shop) return fail("Shop not found.", 404);

  // Find an existing customer by email, then by phone.
  let customer: Customer | null = null;
  if (email) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .ilike("email", email)
      .limit(1)
      .maybeSingle<Customer>();
    if (error) return fail("Could not look up customer.", 500);
    customer = data;
  }
  if (!customer && phone) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle<Customer>();
    if (error) return fail("Could not look up customer.", 500);
    customer = data;
  }
  if (!customer) {
    const { data, error } = await supabase
      .from("customers")
      .insert({ full_name: fullName, email, phone })
      .select("*")
      .single<Customer>();
    if (error || !data) return fail("Could not create customer.", 500);
    customer = data;
  }

  const findCard = () =>
    supabase
      .from("loyalty_cards")
      .select("*")
      .eq("shop_id", shop.id)
      .eq("customer_id", customer!.id)
      .maybeSingle<LoyaltyCard>();

  const { data: existingCard, error: cardError } = await findCard();
  let card = existingCard;
  if (cardError) return fail("Could not look up loyalty card.", 500);

  for (let attempt = 0; !card && attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("loyalty_cards")
      .insert({
        shop_id: shop.id,
        customer_id: customer.id,
        card_code: generateCardCode(),
        status: "active",
        points_balance: 0,
      })
      .select("*")
      .single<LoyaltyCard>();

    if (data) {
      card = data;
    } else if (error?.code === "23505") {
      // Either a concurrent signup created the card or the code collided; re-check, then retry.
      ({ data: card } = await findCard());
    } else {
      return fail("Could not create loyalty card.", 500);
    }
  }
  if (!card) return fail("Could not create loyalty card.", 500);

  const { data: rewards, error: rewardsError } = await supabase
    .from("rewards")
    .select("*")
    .eq("shop_id", shop.id)
    .eq("is_active", true)
    .order("points_required", { ascending: true })
    .returns<Reward[]>();
  if (rewardsError) return fail("Could not load rewards.", 500);

  return NextResponse.json({ customer, card, shop, rewards: rewards ?? [] });
}
