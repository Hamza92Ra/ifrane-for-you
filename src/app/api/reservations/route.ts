import { NextRequest, NextResponse } from "next/server";
import { bookingSchema, validStayDates } from "@/server/validation";
import { BookingPricingError, createPendingBooking } from "@/server/availability";
import { databaseConfigured } from "@/server/db";
import { checkRateLimit, sameOrigin } from "@/server/security";
import { reservationDocumentToken } from "@/server/document-token";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!databaseConfigured() || !process.env.RATE_LIMIT_SECRET || !process.env.DOCUMENT_TOKEN_SECRET || process.env.DOCUMENT_TOKEN_SECRET.length < 32) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>16_384)return NextResponse.json({error:"INVALID_INPUT"},{status:413});
  const rawBody=await request.text().catch(()=>"");
  if(Buffer.byteLength(rawBody,"utf8")>16_384)return NextResponse.json({error:"INVALID_INPUT"},{status:413});
  const body=(()=>{try{return JSON.parse(rawBody)}catch{return null}})();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success || !validStayDates(parsed.data.checkIn, parsed.data.checkOut)) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    if (!await checkRateLimit(request, parsed.data.email)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    const result = await createPendingBooking(parsed.data,reservationDocumentToken);
    if (typeof result === "string") return NextResponse.json({ error: result }, { status: result === "UNAVAILABLE" || result === "ALREADY_PROCESSED" ? 409 : 422 });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch(error) {
    if(error instanceof BookingPricingError)return NextResponse.json({error:error.code},{status:409});
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
