import { NextResponse } from "next/server";
import { requireBrandOwner, errorResponse } from "@/lib/brand-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const access = await requireBrandOwner();
    if (access.error) return access.error;
    const size = Number(request.headers.get("content-length") ?? 0);
    if (size > 2_500_000) return NextResponse.json({ error: "Logo must be at most 2 MB." }, { status: 413 });
    const form = await request.formData();
    const fields = ["legal_name", "address", "phone", "contact_email", "primary_color", "secondary_color"] as const;
    const values: Record<string, string> = {};
    for (const key of fields) {
      const value = form.get(key);
      if (typeof value !== "string" || !value.trim() || value.length > 500) return NextResponse.json({ error: "Complete all brand settings." }, { status: 400 });
      values[key] = value.trim();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email) ||
      !/^#[0-9a-f]{6}$/i.test(values.primary_color) || !/^#[0-9a-f]{6}$/i.test(values.secondary_color)) {
      return NextResponse.json({ error: "Invalid email or colors." }, { status: 400 });
    }
    const db = createSupabaseAdminClient();
    const current = await db.from("loyalty_brands").select("logo_url").eq("id", access.brandId).single<{ logo_url: string | null }>();
    if (current.error) throw current.error;
    let logoUrl = current.data.logo_url;
    const logo = form.get("logo");
    let uploaded = false;
    if (logo instanceof File && logo.size) {
      if (logo.size > 2_000_000) return NextResponse.json({ error: "Logo must be at most 2 MB." }, { status: 400 });
      const bytes = new Uint8Array(await logo.arrayBuffer());
      const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
      const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!png && !jpeg && !webp) return NextResponse.json({ error: "Use a PNG, JPEG or WebP logo." }, { status: 400 });
      const ext = png ? "png" : jpeg ? "jpg" : "webp";
      const type = png ? "image/png" : jpeg ? "image/jpeg" : "image/webp";
      const path = `${access.brandId}/logo.${ext}`;
      const storage = db.storage.from("brand-assets");
      const result = await storage.upload(path, bytes, { contentType: type, upsert: true, cacheControl: "60" });
      if (result.error) throw result.error;
      uploaded = true;
      logoUrl = `${storage.getPublicUrl(path).data.publicUrl}?v=${crypto.randomUUID()}`;
    } else if (logo !== null && !(logo instanceof File)) {
      return NextResponse.json({ error: "Invalid logo file." }, { status: 400 });
    }
    const { data, error } = await db.rpc("slice2c_save_settings", {
      p_brand_id: access.brandId, p_user_id: access.user.id, p_actor_email: access.user.email ?? null,
      p_legal_name: values.legal_name, p_address: values.address, p_phone: values.phone,
      p_contact_email: values.contact_email, p_logo_url: logoUrl,
      p_primary_color: values.primary_color, p_secondary_color: values.secondary_color,
    });
    if (error || !data) {
      console.error("[POST /api/brand/settings] Settings save failed", error);
      return NextResponse.json({ error: uploaded ? "Logo uploaded, but settings could not be saved. Please retry." : "Settings could not be saved." }, { status: 500 });
    }
    return NextResponse.json({ status: "success" });
  } catch (error) { return errorResponse(error, "[POST /api/brand/settings]"); }
}
