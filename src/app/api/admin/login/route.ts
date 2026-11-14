import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authConfigured } from "@/server/auth";
import { db } from "@/server/db";
import { sameOrigin, checkRateLimit } from "@/server/security";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });

  const back = new URL("/admin", request.url);
  const fail = (error: string) => {
    const location = new URL(back);
    location.searchParams.set("error", error);
    return NextResponse.redirect(location, 303);
  };
  if (!authConfigured()) return fail("setup");

  const data = await request.formData().catch(() => null);
  const email = String(data?.get("email") ?? "").slice(0, 254);
  const password = String(data?.get("password") ?? "");
  if (!email || !password) return fail("invalid");

  try {
    if (!await checkRateLimit(request, `admin:${email}`)) return fail("rate_limited");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return fail("setup");

    // Supabase writes its session cookies on this exact response. Constructing a
    // new redirect after authentication can lose Set-Cookie on hosted runtimes.
    const response = NextResponse.redirect(back, 303);
    response.headers.set("Cache-Control", "private, no-store");
    const client = createServerClient(url, key, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(items, headers) {
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          if (headers) Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        }
      }
    });

    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.user) return fail("invalid");

    const rows = await db()`select user_id from public.admin_profiles where user_id = ${result.data.user.id}::uuid and role = 'admin'`;
    if (!rows.length) {
      await client.auth.signOut();
      const denied = new URL(back);
      denied.searchParams.set("error", "unauthorized");
      response.headers.set("Location", denied.toString());
    }
    return response;
  } catch {
    return fail("unavailable");
  }
}
