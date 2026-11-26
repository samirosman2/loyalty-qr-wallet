import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getActiveMembership } from "@/lib/brand-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const member = await getActiveMembership(user.id);
  if (!member || member.role !== "owner" || member.loyalty_brands.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required." }, { status: 415 });
  }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const body = input as Record<string, unknown>;
  const fields = ["legal_name", "address", "phone", "contact_email", "primary_color", "secondary_color"] as const;
  if (fields.some((key) => typeof body[key] !== "string" || !(body[key] as string).trim() || (body[key] as string).length > 500)) {
    return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  }
  const legalName = (body.legal_name as string).trim();
  const address = (body.address as string).trim();
  const phone = (body.phone as string).trim();
  const email = (body.contact_email as string).trim();
  const primary = (body.primary_color as string).trim();
  const secondary = (body.secondary_color as string).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^#[0-9a-f]{6}$/i.test(primary) || !/^#[0-9a-f]{6}$/i.test(secondary)) {
    return NextResponse.json({ error: "Enter a valid email address and colors." }, { status: 400 });
  }
  if (body.logo_url != null && typeof body.logo_url !== "string") return NextResponse.json({ error: "Invalid logo URL." }, { status: 400 });
  const logo = typeof body.logo_url === "string" ? body.logo_url.trim() : "";
  if (logo) {
    try {
      const url = new URL(logo);
      if (url.protocol !== "https:" || url.username || url.password || logo.length > 2048) throw new Error("Invalid URL");
    } catch { return NextResponse.json({ error: "Logo URL must be a valid HTTPS URL." }, { status: 400 }); }
  }
  const { data, error } = await createSupabaseAdminClient().rpc("complete_brand_onboarding", {
    p_brand_id: member.brand_id, p_user_id: user.id, p_actor_email: user.email ?? null,
    p_legal_name: legalName, p_address: address, p_phone: phone, p_contact_email: email,
    p_logo_url: logo || null, p_primary_color: primary, p_secondary_color: secondary,
  });
  if (error) {
    console.error("[POST /api/merchant/brand-setup]", error);
    return NextResponse.json({ error: "Could not save brand setup." }, { status: 500 });
  }
  if (data === "forbidden") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (data === "already_completed") return NextResponse.json({ error: "Brand setup is already complete." }, { status: 409 });
  if (data !== "success") return NextResponse.json({ error: "Invalid brand details." }, { status: 400 });
  return NextResponse.json({ status: "success" });
}
