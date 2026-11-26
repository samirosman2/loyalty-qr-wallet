import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ACTIVE_BRAND_COOKIE, getMemberships } from "@/lib/brand-access";

export async function POST() {
  const auth = await createSupabaseAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let auditFailed = false;
  try {
    const memberships = await getMemberships(user.id);
    const rows = (memberships.length ? memberships : [null]).map((member) => ({
      brand_id: member?.brand_id ?? null, shop_id: member?.assigned_shop_id ?? null,
      actor_user_id: user.id, actor_email: user.email ?? null, event_type: "user_logout",
    }));
    const { error } = await createSupabaseAdminClient().from("audit_logs").insert(rows);
    if (error) throw error;
  } catch (error) {
    console.error("[POST /api/merchant/logout] Audit failed", error);
    auditFailed = true;
  }
  const { error } = await auth.auth.signOut();
  if (error) {
    console.error("[POST /api/merchant/logout] Sign out failed", error);
    return NextResponse.json({ error: "Sign out failed. Please try again." }, { status: 500 });
  }
  const response = NextResponse.json(
    auditFailed ? { error: "Signed out, but audit logging failed.", signedOut: true } : { signedOut: true },
    { status: auditFailed ? 500 : 200 },
  );
  response.cookies.set(ACTIVE_BRAND_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return response;
}
