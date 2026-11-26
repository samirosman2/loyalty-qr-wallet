import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { CUSTOMER_AUTH_COOKIE } from "@/lib/customer-auth-config";

export async function getVerifiedCustomerEmail(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase customer auth configuration.");
  const cookieStore = await cookies();
  const client = createServerClient(url, key, {
    cookieOptions: { name: CUSTOMER_AUTH_COOKIE },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (isAuthSessionMissingError(error) || error.status === 401 || error.status === 403) return null;
    throw error;
  }
  return data.user?.email && data.user.email_confirmed_at ? data.user.email.trim().toLowerCase() : null;
}
