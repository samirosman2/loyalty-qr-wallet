import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerVoucher, PublicVoucher, Reward, Shop } from "@/types/loyalty";

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

export async function getActiveVouchers(supabase: SupabaseClient, brandId: string, customerId: string): Promise<CustomerVoucher[]> {
  const result: CustomerVoucher[] = [];
  const now = new Date().toISOString();
  for (;;) {
    const from = result.length;
    const { data, error, count } = await supabase.from("customer_vouchers")
      .select("id, voucher_code, discount_type, discount_value, status, issued_at, expires_at, redeemed_at", { count: "exact" })
      .eq("brand_id", brandId).eq("customer_id", customerId).eq("status", "active").gt("expires_at", now)
      .order("issued_at", { ascending: false }).order("id").range(from, from + 999).returns<CustomerVoucher[]>();
    if (error) throw error;
    if (count === null || (!data.length && from < count)) throw new Error("Could not retrieve all active vouchers.");
    result.push(...data);
    if (result.length >= count) return result;
  }
}

export async function getPublicVouchers(supabase: SupabaseClient, brandId: string, customerId: string): Promise<PublicVoucher[]> {
  const result: PublicVoucher[] = [];
  const now = new Date().toISOString();
  for (;;) {
    const from = result.length;
    const { data, error, count } = await supabase.from("customer_vouchers")
      .select("discount_type, discount_value, status, issued_at, expires_at, redeemed_at", { count: "exact" })
      .eq("brand_id", brandId).eq("customer_id", customerId)
      .or(`status.eq.redeemed,and(status.eq.active,expires_at.gt.${now})`)
      .order("issued_at", { ascending: false }).order("id").range(from, from + 999).returns<PublicVoucher[]>();
    if (error) throw error;
    if (count === null || (!data.length && from < count)) throw new Error("Could not retrieve all vouchers.");
    result.push(...data);
    if (result.length >= count) return result;
  }
}
