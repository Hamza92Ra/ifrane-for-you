import { NextRequest, NextResponse } from "next/server";
import { availabilitySchema, validStayDates } from "@/server/validation";
import { availability } from "@/server/availability";
import { databaseConfigured } from "@/server/db";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const parsed = availabilitySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success || !validStayDates(parsed.data.checkIn, parsed.data.checkOut)) return NextResponse.json({ error: "INVALID_DATES" }, { status: 400 });
  if (!databaseConfigured()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  try {
    const result = await availability(parsed.data.type, parsed.data.checkIn, parsed.data.checkOut);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
