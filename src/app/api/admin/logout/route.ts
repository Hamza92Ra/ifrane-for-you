import { NextRequest, NextResponse } from "next/server";
import { supabaseAuth } from "@/server/auth";
import { sameOrigin } from "@/server/security";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  try { await (await supabaseAuth()).auth.signOut(); } catch { /* Always clear the user-facing session state. */ }
  return NextResponse.redirect(new URL("/admin", request.url), 303);
}
