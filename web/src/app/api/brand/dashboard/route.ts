import { connection, NextResponse } from "next/server";
import { requireBrandOwner, errorResponse } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  await connection();
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const { data, error } = await createSupabaseAdminClient().rpc("slice2c_dashboard", {
      p_brand_id: access.brandId, p_user_id: access.user.id,
    });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error, "[GET /api/brand/dashboard]"); }
}
