import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_AUTH_COOKIE } from "@/lib/customer-auth-config";

let client: SupabaseClient | undefined;

export function getCustomerBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase browser configuration.");
  if (!client) {
    client = createBrowserClient(url, key, {
      cookieOptions: { name: CUSTOMER_AUTH_COOKIE },
      isSingleton: false,
    });
  }
  return client;
}
