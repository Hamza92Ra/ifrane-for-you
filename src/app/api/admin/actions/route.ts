import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/server/auth";
import { ActionError, performAdminAction } from "@/server/admin-actions";
import { sameOrigin } from "@/server/security";
import { revalidatePath } from "next/cache";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("Forbidden", { status: 403 });
  const back = new URL("/admin", request.url);
  try { const result = await performAdminAction(await request.formData(), admin.id); back.searchParams.set("ok", result); for(const locale of ["fr","en","ar"]){revalidatePath(`/${locale}`);revalidatePath(`/${locale}/book`);revalidatePath(`/${locale}/stays/dome`);revalidatePath(`/${locale}/stays/cabin`);} }
  catch (error) { back.searchParams.set("error", error instanceof ActionError ? error.code : "SERVICE_UNAVAILABLE"); }
  return NextResponse.redirect(back, 303);
}
