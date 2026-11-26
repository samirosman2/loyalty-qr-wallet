import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reward, Shop } from "@/types/loyalty";

export async function getShopRewards(
  supabase: SupabaseClient,
  shop: Pick<Shop, "id" | "brand_id">,
  activeOnly: boolean,
): Promise<Reward[]> {
  let query = shop.brand_id
    ? supabase.from("rewards").select("*, shops!inner(brand_id)").eq("shops.brand_id", shop.brand_id)
    : supabase.from("rewards").select("*").eq("shop_id", shop.id);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("points_required", { ascending: true }).returns<Reward[]>();
  if (error) throw error;
  return data;
}

export async function getBrandBalance(
  supabase: SupabaseClient,
  brandId: string,
  customerId: string,
): Promise<number> {
  const { data, error } = await supabase.from("customer_brand_balances")
    .select("points_balance")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .maybeSingle<{ points_balance: number }>();
  if (error) throw error;
  return data?.points_balance ?? 0;
}
