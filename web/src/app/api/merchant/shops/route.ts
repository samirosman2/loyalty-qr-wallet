import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Reward, Shop } from "@/types/loyalty";

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

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  const supabase = createSupabaseAdminClient();
  const { data: shops, error } = await supabase
    .from("shops")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .returns<Shop[]>();
  if (error) return fail("Could not load shops.", 500);

  const result = await Promise.all(
    (shops ?? []).map(async (shop) => {
      const [rewardsRes, cardsRes] = await Promise.all([
        supabase
          .from("rewards")
          .select("*")
          .eq("shop_id", shop.id)
          .order("points_required", { ascending: true })
          .returns<Reward[]>(),
        supabase.from("loyalty_cards").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
      ]);
      if (rewardsRes.error || cardsRes.error) throw new Error("Could not load shop details.");
      const cardCount = cardsRes.count ?? 0;
      // unique (shop_id, customer_id): each customer has at most one card per shop
      return { ...shop, rewards: rewardsRes.data ?? [], card_count: cardCount, customer_count: cardCount };
    })
  ).catch(() => null);
  if (!result) return fail("Could not load shop details.", 500);

  return NextResponse.json({ shops: result });
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return fail("Unauthorized.", 401);

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

    const { name: rawName, slug: rawSlug, description: rawDescription } = body as Record<string, unknown>;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name.length > 100) return fail("name is required (max 100 characters).", 400);
    if (rawSlug != null && typeof rawSlug !== "string") return fail("slug must be a string.", 400);
    if (rawDescription != null && typeof rawDescription !== "string") {
      return fail("description must be a string.", 400);
    }

    const slug = normalizeSlug(rawSlug?.trim() || name);
    const description = rawDescription?.trim();
    if (!slug || slug.length > 60) return fail("slug is required (max 60 characters).", 400);
    if (description && description.length > 500) return fail("description is too long (max 500).", 400);

    const supabase = createSupabaseAdminClient();
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 8)}`;
      const candidate = suffix ? `${slug.slice(0, 60 - suffix.length).replace(/-+$/, "")}${suffix}` : slug;
      const { data: shop, error } = await supabase
        .from("shops")
        .insert({
          name,
          slug: candidate,
          owner_user_id: user.id,
          ...(description ? { description } : {}),
        })
        .select("*")
        .single<Shop>();
      if (!error) {
        return NextResponse.json({ shop: { ...shop, rewards: [], card_count: 0, customer_count: 0 } }, { status: 201 });
      }
      if (error.code !== "23505" || attempt === 4) throw error;
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
