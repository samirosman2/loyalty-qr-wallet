import "server-only";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Shop } from "@/types/loyalty";

export const ACTIVE_BRAND_COOKIE = "loyalty_active_brand";

export interface Membership {
  brand_id: string;
  role: "owner" | "manager" | "cashier";
  assigned_shop_id: string | null;
  is_active: boolean;
  loyalty_brands: { name: string; slug: string; onboarding_completed: boolean; owner_user_id: string };
}

export async function getMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await createSupabaseAdminClient().from("brand_members")
    .select("brand_id, role, assigned_shop_id, is_active, loyalty_brands!inner(name, slug, onboarding_completed, owner_user_id)")
    .eq("user_id", userId).order("created_at").returns<Membership[]>();
  if (error) throw error;
  return data;
}

export async function getActiveMembership(userId: string): Promise<Membership | null> {
  const selected = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  if (!selected) return null;
  const memberships = await getMemberships(userId);
  return memberships.find((member) => member.brand_id === selected && member.is_active) ?? null;
}

export function destination(member: Membership): string {
  if (member.role === "manager") return "/merchant/scan";
  if (member.role === "owner" && member.loyalty_brands.onboarding_completed) return "/brand/dashboard";
  if (member.role === "owner") return "/brand/setup";
  return "/merchant/login";
}

export async function canScanShop(userId: string, shop: Shop): Promise<boolean> {
  const member = await getActiveMembership(userId);
  if (!shop.brand_id) {
    if (member) return member.role === "owner" && shop.owner_user_id === userId;
    return shop.owner_user_id === userId && (await getMemberships(userId)).length === 0;
  }
  return member?.brand_id === shop.brand_id &&
    (member.role === "owner" || (member.role === "manager" && member.assigned_shop_id === shop.id));
}
