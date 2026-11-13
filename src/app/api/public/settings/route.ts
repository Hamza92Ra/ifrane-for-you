import { NextResponse } from "next/server";
import { publicSettings } from "@/server/settings";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await publicSettings(), { headers: { "Cache-Control": "no-store" } });
}
