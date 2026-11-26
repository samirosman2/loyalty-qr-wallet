import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getShopRewards } from "@/lib/loyalty-data";
import { getActiveMembership, getMemberships } from "@/lib/brand-access";
import type { LoyaltyBrand, Shop } from "@/types/loyalty";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  const supabase = createSupabaseAdminClient();
  const memberships = await getMemberships(user.id);
  const active = await getActiveMembership(user.id);
  const scanMode = new URL(request.url).searchParams.get("mode") === "scan";
  if ((memberships.length && !active) || active?.role === "cashier" || (active?.role === "manager" && !scanMode)) {
    return fail("Forbidden.", 403);
  }
  const brandIds = active ? [active.brand_id] : [];
  let brands: (LoyaltyBrand & { branch_count: number })[] = [];
  if (brandIds.length) {
    const { data, error: brandError } = await supabase
      .from("loyalty_brands")
      .select("id, name, plan_tier, max_branches")
      .in("id", brandIds)
      .returns<LoyaltyBrand[]>();
    if (brandError) return fail("Could not load brands.", 500);
    const counts = await Promise.all(data.map((brand) =>
      supabase.from("shops").select("id", { count: "exact", head: true })
        .eq("brand_id", brand.id).eq("is_active", true)
    ));
    if (counts.some((result) => result.error || result.count === null)) {
      return fail("Could not load branch counts.", 500);
    }
    brands = data.map((brand, index) => ({ ...brand, branch_count: counts[index].count! }));
  }

  let shopQuery = supabase.from("shops").select("*");
  if (active?.role === "manager") {
    shopQuery = shopQuery.eq("id", active.assigned_shop_id ?? "").eq("brand_id", active.brand_id);
  } else if (active) {
    shopQuery = shopQuery.or(`brand_id.eq.${active.brand_id},and(brand_id.is.null,owner_user_id.eq.${user.id})`);
  } else {
    shopQuery = shopQuery.eq("owner_user_id", user.id).is("brand_id", null);
  }
  const { data: shops, error } = await shopQuery
    .order("created_at", { ascending: true })
    .returns<Shop[]>();
  if (error) return fail("Could not load shops.", 500);

  const result = await Promise.all(
    (shops ?? []).map(async (shop) => {
      const [rewards, cardsRes] = await Promise.all([
        getShopRewards(supabase, shop, false),
        supabase.from("loyalty_cards").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
      ]);
      if (cardsRes.error) throw cardsRes.error;
      const cardCount = cardsRes.count ?? 0;
      // unique (shop_id, customer_id): each customer has at most one card per shop
      return { ...shop, rewards, card_count: cardCount, customer_count: cardCount };
    })
  ).catch((error) => { console.error("[GET /api/merchant/shops]", error); return null; });
  if (!result) return fail("Could not load shop details.", 500);

  return NextResponse.json({ shops: result, brands });
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return fail("Unauthorized.", 401);
    const memberships = await getMemberships(user.id);
    const active = await getActiveMembership(user.id);
    if ((memberships.length && !active) || (active && active.role !== "owner")) return fail("Forbidden.", 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) return fail("Invalid JSON body.", 400);
      throw error;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid JSON body.", 400);
    }

    const { name: rawName, slug: rawSlug, description: rawDescription, brandId } = body as Record<string, unknown>;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name.length > 100) return fail("name is required (max 100 characters).", 400);
    if (rawSlug != null && typeof rawSlug !== "string") return fail("slug must be a string.", 400);
    if (rawDescription != null && typeof rawDescription !== "string") {
      return fail("description must be a string.", 400);
    }
    if (brandId !== undefined && (typeof brandId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId))) {
      return fail("brandId must be a valid UUID.", 400);
    }
    if (brandId !== undefined && brandId !== active?.brand_id) return fail("Forbidden.", 403);

    const slug = normalizeSlug(rawSlug?.trim() || name);
    const description = rawDescription?.trim();
    if (!slug || slug.length > 60) return fail("slug is required (max 60 characters).", 400);
    if (description && description.length > 500) return fail("description is too long (max 500).", 400);

    const supabase = createSupabaseAdminClient();
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 8)}`;
      const candidate = suffix ? `${slug.slice(0, 60 - suffix.length).replace(/-+$/, "")}${suffix}` : slug;
      const { data, error } = await supabase.rpc("create_merchant_branch", {
        p_user_id: user.id,
        p_name: name,
        p_slug: candidate,
        p_description: description || null,
        p_brand_id: brandId ?? null,
      });
      if (!error) {
        if (data?.status === "forbidden") return fail("Forbidden.", 403);
        if (data?.status === "branch_limit") {
          return fail("Branch limit reached for your current plan. Upgrade to Growth to add more branches.", 403);
        }
        if (data?.status !== "success" || !data.shop) throw new Error("Unexpected branch creation result.");
        return NextResponse.json({ shop: { ...data.shop, rewards: [], card_count: 0, customer_count: 0 } }, { status: 201 });
      }
      if (error.code !== "23505" || !error.details?.includes("(slug)") || attempt === 4) throw error;
    }
    throw new Error("Could not create shop.");
  } catch (err) {
    console.error("[POST /api/merchant/shops]", err);
    const error = err && typeof err === "object" ? err : {};
    return NextResponse.json({
      error: "message" in error && typeof error.message === "string" && error.message || "Could not create shop.",
      code: "code" in error && typeof error.code === "string" && error.code || null,
      details: "details" in error && typeof error.details === "string" && error.details || null,
    }, { status: 500 });
  }
}
