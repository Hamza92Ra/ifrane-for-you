import "server-only";
import type { Locale } from "@/i18n";
import type { Photo } from "@/content/stays";
import { databaseConfigured, db } from "./db";

export async function publicType(slug: string, locale: Locale) {
  if (!databaseConfigured()) return null;
  try {
    const rows = await db()`select names,descriptions,amenities from public.accommodation_types where slug=${slug} and published`;
    if (!rows.length) return null;
    const row = rows[0];
    return {
      name: String(row.names?.[locale] || row.names?.fr || ""),
      description: String(row.descriptions?.[locale] || row.descriptions?.fr || ""),
      amenities: Array.isArray(row.amenities?.[locale]) ? row.amenities[locale].filter((v:unknown):v is string=>typeof v==="string") : []
    };
  } catch { return null; }
}

export async function businessText(locale:Locale) {
  if (!databaseConfigured()) return null;
  try {
    const rows=await db()`select booking_policy,arrival_policy,location_text from public.business_settings where id=1`;
    const row=rows[0];
    if(!row)return null;
    const value=(field:Record<string,string>)=>String(field?.[locale] || field?.fr || "").trim();
    return {bookingPolicy:value(row.booking_policy),arrivalPolicy:value(row.arrival_policy),location:value(row.location_text)};
  } catch { return null; }
}

export async function customStay(slug:string, locale:Locale) {
  if (!databaseConfigured() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const rows=await db()`select id,names,descriptions,amenities from public.accommodation_types where slug=${slug} and published and slug not in ('dome','cabin')`;
    if(!rows.length)return null;
    const row=rows[0];
    const imageRows=await db()`select storage_path,alt_text,width,height,role from public.accommodation_images where type_id=${row.id}::uuid order by sort_order,created_at`;
    if(!imageRows.length)return null;
    const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const images:Photo[]=imageRows.map(i=>({src:`${origin}/storage/v1/object/public/accommodation-images/${String(i.storage_path).split("/").map(encodeURIComponent).join("/")}`,width:i.width,height:i.height,alt:{fr:String(i.alt_text?.fr||""),en:String(i.alt_text?.en||""),ar:String(i.alt_text?.ar||"")}}));
    const hero=imageRows.findIndex(i=>i.role==="hero");
    return {name:String(row.names?.[locale]||row.names?.fr||slug),description:String(row.descriptions?.[locale]||row.descriptions?.fr||""),amenities:Array.isArray(row.amenities?.[locale])?row.amenities[locale].filter((v:unknown):v is string=>typeof v==="string"):[],photos:images,hero:images[hero>=0?hero:0]};
  } catch { return null; }
}

export async function otherStays(locale:Locale) {
  if(!databaseConfigured() || !process.env.NEXT_PUBLIC_SUPABASE_URL)return [];
  try {
    const rows=await db()`select t.slug,t.names,i.storage_path,i.width,i.height,i.alt_text from public.accommodation_types t
      join lateral (select storage_path,width,height,alt_text from public.accommodation_images where type_id=t.id order by (role='hero') desc,sort_order,created_at limit 1) i on true
      where t.published and t.slug not in ('dome','cabin') order by t.created_at`;
    const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
    return rows.map(r=>({slug:String(r.slug),name:String(r.names?.[locale]||r.names?.fr||r.slug),photo:{src:`${origin}/storage/v1/object/public/accommodation-images/${String(r.storage_path).split("/").map(encodeURIComponent).join("/")}`,width:r.width as number,height:r.height as number,alt:String(r.alt_text?.[locale]||r.alt_text?.fr||"")}}));
  } catch {return []}
}
