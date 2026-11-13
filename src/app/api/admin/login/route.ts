import { NextRequest, NextResponse } from "next/server";
import { authConfigured, supabaseAuth } from "@/server/auth";
import { db } from "@/server/db";
import { sameOrigin, checkRateLimit } from "@/server/security";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const back = new URL("/admin", request.url);
  if (!authConfigured()) { back.searchParams.set("error", "setup"); return NextResponse.redirect(back, 303); }
  const data = await request.formData();
  const email = String(data.get("email") ?? "").slice(0, 254);
  const password = String(data.get("password") ?? "");
  if (!email || !password) { back.searchParams.set("error", "invalid"); return NextResponse.redirect(back, 303); }
  try {
    if (!await checkRateLimit(request, `admin:${email}`)) { back.searchParams.set("error", "rate_limited"); return NextResponse.redirect(back, 303); }
    const client = await supabaseAuth();
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.user) { back.searchParams.set("error", "invalid"); return NextResponse.redirect(back, 303); }
    const rows = await db()`select user_id from public.admin_profiles where user_id = ${result.data.user.id}::uuid and role = 'admin'`;
    if (!rows.length) { await client.auth.signOut(); back.searchParams.set("error", "unauthorized"); return NextResponse.redirect(back, 303); }
    return NextResponse.redirect(back, 303);
  } catch { back.searchParams.set("error", "unavailable"); return NextResponse.redirect(back, 303); }
}
