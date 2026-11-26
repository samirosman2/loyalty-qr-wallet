import { NextResponse } from "next/server";
import { requireBrandOwner, errorResponse, isUuid } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function parse(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}
const passwordValid = (value: unknown): value is string => typeof value === "string" && value.length >= 12 && value.length <= 128;

export async function POST(request: Request) {
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const body = await parse(request);
    if (!body || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
      body.email.length > 254 || !passwordValid(body.password) || !isUuid(body.shopId)) {
      return NextResponse.json({ error: "Enter a valid email, branch and password of at least 12 characters." }, { status: 400 });
    }
    const db = createSupabaseAdminClient();
    const branch = await db.from("shops").select("id").eq("id", body.shopId).eq("brand_id", access.brandId).maybeSingle();
    if (branch.error) throw branch.error;
    if (!branch.data) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: body.email.trim().toLowerCase(), password: body.password, email_confirm: true,
    });
    if (createError || !created.user) {
      console.error("[POST /api/brand/managers] Auth creation failed", createError);
      return NextResponse.json({ error: createError?.message ?? "Could not create manager account." }, { status: 400 });
    }
    const { data, error } = await db.rpc("slice2c_save_manager", {
      p_brand_id: access.brandId, p_actor: access.user.id, p_actor_email: access.user.email ?? null,
      p_member_id: null, p_manager_user_id: created.user.id, p_shop_id: body.shopId, p_active: true,
    });
    if (error || data?.status !== "success") {
      console.error("[POST /api/brand/managers] Membership failed", error ?? data);
      return NextResponse.json({ error: "Account was created, but assignment failed. Contact an administrator before retrying.", userId: created.user.id }, { status: 500 });
    }
    return NextResponse.json({ status: "success" }, { status: 201 });
  } catch (error) { return errorResponse(error, "[POST /api/brand/managers]"); }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const body = await parse(request);
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid manager." }, { status: 400 });
    const db = createSupabaseAdminClient();
    if (body.action === "password") {
      if (!passwordValid(body.password)) return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
      const { data: manager, error } = await db.from("brand_members").select("user_id, assigned_shop_id")
        .eq("id", body.id).eq("brand_id", access.brandId).eq("role", "manager")
        .maybeSingle<{ user_id: string; assigned_shop_id: string }>();
      if (error) throw error;
      if (!manager) return NextResponse.json({ error: "Manager not found." }, { status: 404 });
      const other = await db.from("brand_members").select("id", { count: "exact", head: true })
        .eq("user_id", manager.user_id).neq("brand_id", access.brandId);
      if (other.error || other.count === null) throw other.error ?? new Error("Could not verify memberships.");
      if (other.count > 0) return NextResponse.json({ error: "Password reset is unavailable for an account belonging to other brands." }, { status: 409 });
      const changed = await db.auth.admin.updateUserById(manager.user_id, { password: body.password });
      if (changed.error) throw changed.error;
      const logged = await db.from("audit_logs").insert({
        brand_id: access.brandId, shop_id: manager.assigned_shop_id, actor_user_id: access.user.id,
        actor_email: access.user.email ?? null, event_type: "manager_password_reset",
        metadata: { manager_user_id: manager.user_id },
      });
      if (logged.error) {
        console.error("[PATCH /api/brand/managers] Password changed but audit failed", logged.error);
        return NextResponse.json({ error: "Password was changed, but audit logging failed. Contact an administrator." }, { status: 500 });
      }
      return NextResponse.json({ status: "success" });
    }
    if (!isUuid(body.shopId) || typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "Branch and status are required." }, { status: 400 });
    }
    const { data, error } = await db.rpc("slice2c_save_manager", {
      p_brand_id: access.brandId, p_actor: access.user.id, p_actor_email: access.user.email ?? null,
      p_member_id: body.id, p_manager_user_id: null, p_shop_id: body.shopId, p_active: body.isActive,
    });
    if (error) throw error;
    if (data?.status !== "success") return NextResponse.json({ error: "Manager or branch not found." }, { status: data?.status === "forbidden" ? 403 : 404 });
    return NextResponse.json(data);
  } catch (error) { return errorResponse(error, "[PATCH /api/brand/managers]"); }
}
