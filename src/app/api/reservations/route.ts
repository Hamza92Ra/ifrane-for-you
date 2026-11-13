import { NextRequest, NextResponse } from "next/server";
import { bookingSchema, validStayDates } from "@/server/validation";
import { createPendingBooking } from "@/server/availability";
import { databaseConfigured } from "@/server/db";
import { checkRateLimit, sameOrigin } from "@/server/security";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!databaseConfigured() || !process.env.RATE_LIMIT_SECRET) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const body = await request.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success || !validStayDates(parsed.data.checkIn, parsed.data.checkOut)) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    if (!await checkRateLimit(request, parsed.data.email)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    const result = await createPendingBooking(parsed.data);
    if (typeof result === "string") return NextResponse.json({ error: result }, { status: result === "UNAVAILABLE" || result === "ALREADY_PROCESSED" ? 409 : 422 });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
