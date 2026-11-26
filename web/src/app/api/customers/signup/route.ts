import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getVerifiedCustomerEmail } from "@/lib/supabase/customer-server";
import { CONSENT_VERSION, CORE_CONSENT_TEXT, MARKETING_CONSENT_TEXT } from "@/lib/consent-text";
import { getBrandBalance, getShopRewards } from "@/lib/loyalty-data";
import type { Customer, LoyaltyCard, Shop } from "@/types/loyalty";

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
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return fail("JSON body required.", 415);
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Invalid JSON body.", 400);
  const body = input as Record<string, unknown>;

  const shopSlug = clean(body.shopSlug);
  const fullName = clean(body.fullName);
  const email = clean(body.email)?.toLowerCase() ?? null;
  const phone = clean(body.phone);

  if (!shopSlug || !fullName) return fail("shopSlug and fullName are required.", 400);
  if (!email) return fail("A verified email address is required.", 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Invalid email address.", 400);
  if (body.marketingAdsConsent !== undefined && typeof body.marketingAdsConsent !== "boolean") {
    return fail("marketingAdsConsent must be a boolean.", 400);
  }
  const marketingAdsConsent = body.marketingAdsConsent === true;

  let verifiedEmail: string | null;
  try {
    verifiedEmail = await getVerifiedCustomerEmail();
  } catch (error) {
    console.error("[POST /api/customers/signup] Authentication failed", error);
    return fail("Could not verify your email session.", 500);
  }
  if (!verifiedEmail) return fail("Verify your email address first.", 401);
  if (verifiedEmail !== email) return fail("Email does not match your verified account.", 403);

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
  if (!shop || !shop.is_active) return fail("Shop not found.", 404);
  if (!shop.brand_id) return fail("This shop must be assigned to a brand before signup.", 409);

  const { data: existingCustomer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle<Customer>();
  if (customerError) {
    console.error("[POST /api/customers/signup] Customer lookup failed", customerError);
    return fail("Could not look up customer.", 500);
  }
  let customer = existingCustomer;
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

  try {
    const [rewards, balance] = await Promise.all([
      getShopRewards(supabase, shop, true),
      shop.brand_id ? getBrandBalance(supabase, shop.brand_id, customer.id) : Promise.resolve(card.points_balance),
    ]);
    const { error: consentError } = await supabase.from("customer_consents").insert([
      {
        brand_id: shop.brand_id, customer_id: customer.id, source_shop_id: shop.id,
        consent_type: "loyalty_core", granted: true,
        consent_version: CONSENT_VERSION, consent_text_snapshot: CORE_CONSENT_TEXT,
      },
      {
        brand_id: shop.brand_id, customer_id: customer.id, source_shop_id: shop.id,
        consent_type: "marketing_ads", granted: marketingAdsConsent,
        consent_version: CONSENT_VERSION, consent_text_snapshot: MARKETING_CONSENT_TEXT,
      },
    ]);
    if (consentError) throw consentError;
    return NextResponse.json({ customer, card: { ...card, points_balance: balance }, shop, rewards });
  } catch (error) {
    console.error("[POST /api/customers/signup]", error);
    return fail("Could not load loyalty details.", 500);
  }
}
