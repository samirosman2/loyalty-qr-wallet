import "server-only";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership } from "@/lib/brand-access";

export async function requireBrandOwner() {
  const user = await getAuthenticatedUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const member = await getActiveMembership(user.id);
  if (!member || member.role !== "owner" || member.loyalty_brands.owner_user_id !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { user, brandId: member.brand_id };
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function errorResponse(error: unknown, context: string) {
  console.error(context, error);
  return NextResponse.json({ error: "The operation could not be completed." }, { status: 500 });
}
