import { NextResponse } from "next/server";
import { requireBrandOwner, errorResponse, isUuid } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    const { id, name, slug, branchCode, address, isActive } = body;
    if ((id != null && !isUuid(id)) || typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
      typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60 ||
      (branchCode != null && (typeof branchCode !== "string" || branchCode.length > 100)) ||
      (address != null && (typeof address !== "string" || address.length > 500)) || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "Invalid branch details. Use a lowercase hyphenated slug." }, { status: 400 });
    }
    const { data, error } = await createSupabaseAdminClient().rpc("slice2c_save_branch", {
      p_brand_id: access.brandId, p_user_id: access.user.id, p_actor_email: access.user.email ?? null,
      p_shop_id: id ?? null, p_name: name.trim(), p_slug: slug,
      p_branch_code: typeof branchCode === "string" ? branchCode.trim() || null : null,
      p_address: typeof address === "string" ? address.trim() || null : null, p_is_active: isActive,
    });
    if (error?.code === "23505") return NextResponse.json({ error: "That branch slug is already in use." }, { status: 409 });
    if (error) throw error;
    if (data?.status === "branch_limit") return NextResponse.json({ error: "Branch limit reached for your current plan." }, { status: 403 });
    if (data?.status !== "success") return NextResponse.json({ error: "Branch could not be saved." }, { status: data?.status === "forbidden" ? 403 : 400 });
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error, "[POST /api/brand/branches]"); }
}
