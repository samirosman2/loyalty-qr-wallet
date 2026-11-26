import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { ACTIVE_BRAND_COOKIE, destination, getMemberships } from "@/lib/brand-access";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required." }, { status: 415 });
  }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || !("brandId" in input) || typeof input.brandId !== "string") {
    return NextResponse.json({ error: "Brand is required." }, { status: 400 });
  }
  const memberships = await getMemberships(user.id);
  const member = memberships.find((item) => item.is_active && item.brand_id === input.brandId && (item.role === "owner" || item.role === "manager"));
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const response = NextResponse.json({ redirect: destination(member) });
  response.cookies.set(ACTIVE_BRAND_COOKIE, member.brand_id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
