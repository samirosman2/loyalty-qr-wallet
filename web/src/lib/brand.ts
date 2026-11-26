import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface BrandTheme {
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

type ThemeRow = {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

function theme(row: ThemeRow): BrandTheme {
  return {
    name: row.name,
    logo_url: row.logo_url,
    primary_color: /^#[0-9a-f]{6}$/i.test(row.primary_color ?? "") ? row.primary_color! : "#111827",
    secondary_color: /^#[0-9a-f]{6}$/i.test(row.secondary_color ?? "") ? row.secondary_color! : "#2563eb",
  };
}

export async function getBrandThemeById(id: string): Promise<BrandTheme | null> {
  const { data, error } = await createSupabaseAdminClient().from("loyalty_brands")
    .select("name, logo_url, primary_color, secondary_color").eq("id", id).maybeSingle<ThemeRow>();
  if (error) throw error;
  return data ? theme(data) : null;
}

export async function getBrandThemeBySlug(slug: string): Promise<BrandTheme | null> {
  const { data, error } = await createSupabaseAdminClient().from("loyalty_brands")
    .select("name, logo_url, primary_color, secondary_color").eq("slug", slug).maybeSingle<ThemeRow>();
  if (error) throw error;
  return data ? theme(data) : null;
}

export async function getBrandThemeByShopSlug(slug: string): Promise<BrandTheme | null> {
  const { data, error } = await createSupabaseAdminClient().from("shops")
    .select("brand_id").eq("slug", slug).eq("is_active", true).maybeSingle<{ brand_id: string | null }>();
  if (error) throw error;
  return data?.brand_id ? getBrandThemeById(data.brand_id) : null;
}
