import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Use only in server code (route handlers, server actions).
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
