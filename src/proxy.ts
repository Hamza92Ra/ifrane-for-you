import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items, headers) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Preserve cache directives supplied by Supabase when refreshing tokens.
        if (headers) Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      }
    }
  });
  await client.auth.getUser();
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
