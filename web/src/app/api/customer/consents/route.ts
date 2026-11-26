import { NextResponse } from "next/server";
import { CONSENT_VERSION, MARKETING_CONSENT_TEXT } from "@/lib/consent-text";
import { getVerifiedCustomerEmail } from "@/lib/supabase/customer-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Customer, LoyaltyCard, Shop } from "@/types/loyalty";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function authorize(cardCode: string) {
  const email = await getVerifiedCustomerEmail();
  if (!email) return { error: fail("E-Mail-Bestätigung erforderlich.", 401) };
  const supabase = createSupabaseAdminClient();
  const { data: card, error: cardError } = await supabase.from("loyalty_cards")
    .select("customer_id, shop_id").eq("card_code", cardCode)
    .maybeSingle<Pick<LoyaltyCard, "customer_id" | "shop_id">>();
  if (cardError) throw cardError;
  if (!card) return { error: fail("Karte nicht gefunden.", 404) };
  const [customer, shop] = await Promise.all([
    supabase.from("customers").select("email").eq("id", card.customer_id).single<Pick<Customer, "email">>(),
    supabase.from("shops").select("brand_id").eq("id", card.shop_id).single<Pick<Shop, "brand_id">>(),
  ]);
  if (customer.error) throw customer.error;
  if (shop.error) throw shop.error;
  if (!customer.data.email || customer.data.email.trim().toLowerCase() !== email) {
    return { error: fail("Diese E-Mail-Adresse gehört nicht zu dieser Karte.", 403) };
  }
  if (!shop.data.brand_id) return { error: fail("Dieser Filiale ist keine Marke zugeordnet.", 409) };
  return {
    supabase,
    brandId: shop.data.brand_id,
    customerId: card.customer_id,
    shopId: card.shop_id,
  };
}

export async function GET(request: Request) {
  const cardCode = new URL(request.url).searchParams.get("cardCode")?.trim();
  if (!cardCode) return fail("Kartencode erforderlich.", 400);
  try {
    const access = await authorize(cardCode);
    if (access.error) return access.error;
    const { data, error } = await access.supabase.from("customer_consents")
      .select("granted").eq("brand_id", access.brandId).eq("customer_id", access.customerId)
      .eq("consent_type", "marketing_ads").order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(1).maybeSingle<{ granted: boolean }>();
    if (error) throw error;
    return NextResponse.json({ granted: data?.granted ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/customer/consents]", error);
    return fail("Einwilligung konnte nicht geladen werden.", 500);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return fail("JSON erforderlich.", 415);
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail("Ungültiges JSON.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Ungültiges JSON.", 400);
  const { cardCode, granted } = input as Record<string, unknown>;
  if (typeof cardCode !== "string" || !cardCode.trim() || typeof granted !== "boolean") {
    return fail("Kartencode und Einwilligung erforderlich.", 400);
  }
  try {
    const access = await authorize(cardCode.trim());
    if (access.error) return access.error;
    const { error } = await access.supabase.from("customer_consents").insert({
      brand_id: access.brandId,
      customer_id: access.customerId,
      source_shop_id: access.shopId,
      consent_type: "marketing_ads",
      granted,
      consent_version: CONSENT_VERSION,
      consent_text_snapshot: MARKETING_CONSENT_TEXT,
    });
    if (error) throw error;
    return NextResponse.json({ granted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST /api/customer/consents]", error);
    return fail("Einwilligung konnte nicht gespeichert werden.", 500);
  }
}
