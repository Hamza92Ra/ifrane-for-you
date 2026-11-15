import { NextRequest,NextResponse } from "next/server";
import { db,databaseConfigured } from "@/server/db";
import { isLocale } from "@/i18n";
import { staySlug } from "@/server/validation";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  const parsed=staySlug.safeParse(request.nextUrl.searchParams.get("type"));
  const localeRaw=request.nextUrl.searchParams.get("locale")??"fr";
  if(!parsed.success||!isLocale(localeRaw))return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  if(!databaseConfigured())return NextResponse.json({options:[],configured:false},{headers:{"Cache-Control":"no-store"}});
  try{
    const rows=await db()`select o.id,o.kind,o.pricing_basis,o.unit_price,o.currency,o.names->>${localeRaw} as name,o.descriptions->>${localeRaw} as description
      from public.booking_options o join public.accommodation_types t on t.slug=${parsed.data} and t.published
      where o.active and o.published and (o.type_id is null or o.type_id=t.id)
      order by o.kind,o.sort_order,o.created_at`;
    return NextResponse.json({options:rows,configured:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"SERVICE_UNAVAILABLE"},{status:503});}
}
