import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ACTIVE_BRAND_COOKIE, destination, getMemberships } from "@/lib/brand-access";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON body required." }, { status: 415 });
  }
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input !== "object" || !("email" in input) || !("password" in input) ||
      typeof input.email !== "string" || typeof input.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const auth = await createSupabaseAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? "Sign in failed." }, { status: 401 });

  try {
    const memberships = await getMemberships(data.user.id);
    const auditRows = (memberships.length ? memberships : [null]).map((member) => ({
      brand_id: member?.brand_id ?? null,
      shop_id: member?.assigned_shop_id ?? null,
      actor_user_id: data.user.id,
      actor_email: data.user.email ?? null,
      event_type: "user_login",
    }));
    const { error: auditError } = await createSupabaseAdminClient().from("audit_logs").insert(auditRows);
    if (auditError) throw auditError;
    const eligible = memberships.filter((member) => member.is_active && (member.role === "owner" || member.role === "manager"));
    if (!eligible.length && memberships.length) {
      await auth.auth.signOut();
      return NextResponse.json({ error: "Your account does not have merchant access." }, { status: 403 });
    }
    const selected = eligible.length === 1 ? eligible[0] : null;
    const next = selected ? destination(selected) : eligible.length ? "/merchant/select-brand" : "/merchant/dashboard";
    const response = NextResponse.json({ redirect: next });
    response.cookies.set(ACTIVE_BRAND_COOKIE, selected?.brand_id ?? "", {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: selected ? 60 * 60 * 24 * 30 : 0,
    });
    return response;
  } catch (error) {
    console.error("[POST /api/merchant/login]", error);
    await auth.auth.signOut();
    return NextResponse.json({ error: "Could not complete sign in. Please try again." }, { status: 500 });
  }
}
