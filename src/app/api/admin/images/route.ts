import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { currentAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { sameOrigin } from "@/server/security";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
const bucket = "accommodation-images";
function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("STORAGE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(bucket);
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return new NextResponse("Forbidden", { status: 403 });
  const form=await request.formData();
  const back = new URL(form.get("return_to")==="/admin/gallery"?"/admin/gallery":"/admin", request.url);
  try {
    const typeId = z.uuid().parse(form.get("type_id"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 5_242_880) throw new Error("INVALID_IMAGE");
    const raw = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(raw, { failOn: "error" }).metadata();
    if (!meta.width || !meta.height || meta.width > 8000 || meta.height > 8000 || !["jpeg","png","webp"].includes(meta.format ?? "")) throw new Error("INVALID_IMAGE");
    const converted = await sharp(raw).rotate().resize(1800,1800,{fit:"inside",withoutEnlargement:true}).webp({quality:82,effort:5}).toBuffer({resolveWithObject:true});
    const path = `${typeId}/${randomUUID()}.webp`;
    const store = storage();
    const uploaded = await store.upload(path, converted.data, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
    if (uploaded.error) throw uploaded.error;
    try {
      const alt = { fr: String(form.get("alt_fr") ?? "").trim().slice(0,200), en: String(form.get("alt_en") ?? "").trim().slice(0,200), ar: String(form.get("alt_ar") ?? "").trim().slice(0,200) };
      if (!alt.fr || !alt.en || !alt.ar) throw new Error("INVALID_ALT_TEXT");
      const sql = db();
      const rows = await sql.begin(async (tx) => {
        await tx`select id from public.accommodation_types where id=${typeId}::uuid for update`;
        return tx`insert into public.accommodation_images (type_id,storage_path,alt_text,width,height,sort_order)
          values (${typeId}::uuid,${path},${tx.json(alt)},${converted.info.width},${converted.info.height},
          (select coalesce(max(sort_order),-1)+1 from public.accommodation_images where type_id=${typeId}::uuid)) returning id`;
      });
      await db()`insert into public.audit_logs (actor_user_id,action,entity_table,entity_id,after_data) values (${admin.id}::uuid,'upload_image','accommodation_images',${rows[0].id}::uuid,${db().json({path})})`;
    } catch (error) { await store.remove([path]); throw error; }
    back.searchParams.set("ok", "image_uploaded");
    for(const locale of ["fr","en","ar"]){revalidatePath(`/${locale}`);revalidatePath(`/${locale}/stays/dome`);revalidatePath(`/${locale}/stays/cabin`);}
  } catch { back.searchParams.set("error", "INVALID_IMAGE_OR_STORAGE"); }
  return NextResponse.redirect(back,303);
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const body = await request.json().catch(()=>null);
  const parsed = z.object({id:z.uuid()}).safeParse(body);
  if (!parsed.success) return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  try {
    const sql = db();
    const rows = await sql`select type_id from public.accommodation_images where id=${parsed.data.id}::uuid`;
    if (!rows.length) return NextResponse.json({error:"NOT_FOUND"},{status:404});
    await sql.begin(async (tx) => {
      await tx`select id from public.accommodation_types where id=${rows[0].type_id}::uuid for update`;
      const locked = await tx`select storage_path from public.accommodation_images where id=${parsed.data.id}::uuid for update`;
      if (!locked.length) throw new Error("NOT_FOUND");
      const storagePath = locked[0].storage_path as string;
      if (!storagePath.startsWith("local:")) {
        const removed = await storage().remove([storagePath]);
        if (removed.error) throw removed.error;
      }
      await tx`delete from public.accommodation_images where id=${parsed.data.id}::uuid`;
      await tx`insert into public.audit_logs (actor_user_id,action,entity_table,entity_id,before_data) values (${admin.id}::uuid,'delete_image','accommodation_images',${parsed.data.id}::uuid,${tx.json({path:storagePath})})`;
    });
    for(const locale of ["fr","en","ar"]){revalidatePath(`/${locale}`);revalidatePath(`/${locale}/stays/dome`);revalidatePath(`/${locale}/stays/cabin`);}
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:"SERVICE_UNAVAILABLE"},{status:503}); }
}
