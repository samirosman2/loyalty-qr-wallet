import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-aware client acting as the logged-in user (anon key, RLS applies).
export async function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

// Validates the session with Supabase (getUser, not the unverified cookie contents).
export async function getAuthenticatedUser() {
  const supabase = await createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
