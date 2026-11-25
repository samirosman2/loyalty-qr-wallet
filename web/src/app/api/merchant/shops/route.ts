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
  const user = await getAuthenticatedUser();
  if (!user) return fail("Unauthorized.", 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const slug = typeof body.slug === "string" ? normalizeSlug(body.slug) : "";

  if (!name || name.length > 100) return fail("name is required (max 100 characters).", 400);
  if (!slug || slug.length > 60) return fail("slug is required (max 60 characters).", 400);
  if (description && description.length > 500) return fail("description is too long (max 500).", 400);

  const supabase = createSupabaseAdminClient();

  const { data: existing, error: lookupError } = await supabase
    .from("shops")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (lookupError) return fail("Could not check slug.", 500);
  if (existing) return fail("That slug is already taken.", 409);

  const { data: shop, error } = await supabase
    .from("shops")
    .insert({ name, slug, description, owner_user_id: user.id })
    .select("*")
    .single<Shop>();
  if (error) {
    if (error.code === "23505") return fail("That slug is already taken.", 409);
    return fail("Could not create shop.", 500);
  }

  return NextResponse.json({ shop: { ...shop, rewards: [], card_count: 0, customer_count: 0 } }, { status: 201 });
}
