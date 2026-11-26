import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_AUTH_COOKIE } from "@/lib/customer-auth-config";

// Refreshes the Supabase auth cookies on every matched request.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(request.nextUrl.pathname.startsWith("/merchant/") ||
      request.nextUrl.pathname.startsWith("/api/merchant/") ||
      request.nextUrl.pathname.startsWith("/api/cards/") ||
      request.nextUrl.pathname === "/api/transactions"
        ? {}
        : { cookieOptions: { name: CUSTOMER_AUTH_COOKIE } }),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/merchant/:path*", "/api/cards/:path*", "/api/transactions", "/api/merchant/:path*", "/join/:path*", "/card/:path*", "/api/customers/signup", "/api/customer/consents"],
};
