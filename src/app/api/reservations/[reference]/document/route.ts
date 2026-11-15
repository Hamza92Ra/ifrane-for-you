import { NextRequest,NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import path from "node:path";
import { db } from "@/server/db";
import { currentAdmin } from "@/server/auth";
import { validDocumentToken } from "@/server/document-token";
import { bookingText } from "@/i18n/booking";
import type { Locale } from "@/i18n";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const safeLocale=(value:string|null):Locale=>value==="en"||value==="ar"?value:"fr";
export async function GET(request:NextRequest,{params}:{params:Promise<{reference:string}>}){
  const {reference}=await params;
  if(!/^[A-Z0-9-]{6,40}$/.test(reference))return new NextResponse(null,{status:404});
  const locale=safeLocale(request.nextUrl.searchParams.get("locale"));
  const sql=db();
  const rows=await sql`select r.*,r.check_in::text as check_in_text,r.check_out::text as check_out_text,t.names as type_names
    from public.reservations r join public.accommodation_types t on t.id=r.type_id where r.reference=${reference} limit 1`;
  if(!rows.length)return new NextResponse(null,{status:404});
  const row=rows[0];
  const isAdmin=Boolean(await currentAdmin());
  const token=request.nextUrl.searchParams.get("token")??"";
  if(!isAdmin){
    if(token.length>160||!row.request_key||!process.env.DOCUMENT_TOKEN_SECRET||!validDocumentToken(String(row.id),String(row.request_key),token))return new NextResponse(null,{status:404});
  }
  const selections=await sql`select option_name_snapshot,kind,quantity,unit_price,line_total,currency from public.reservation_option_selections where reservation_id=${row.id}::uuid order by kind,created_at`;
  const t=bookingText[locale];
  const doc=new PDFDocument({size:"A4",margin:48,info:{Title:`${t.documentTitle} ${reference}`,Author:"Ifrane For You"}});
  const chunks:Buffer[]=[];
  doc.on("data",chunk=>chunks.push(Buffer.from(chunk)));
  const complete=new Promise<Buffer>((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject)});
  const rtl=locale==="ar";
  if(rtl){
    const arabicFont=path.join(process.cwd(),"node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff");
    doc.registerFont("Naskh",arabicFont).font("Naskh");
  }
  const align=rtl?"right":"left";
  const write=(value:string,size=11,color="#252723",bold=false)=>{doc.font(rtl?"Naskh":bold?"Helvetica-Bold":"Helvetica").fontSize(size).fillColor(color).text(value,{align,features:rtl?["rtla","rlig","calt"]:undefined});};
  doc.rect(0,0,595,118).fill("#273D34");
  doc.fillColor("#F7F3EB").font(rtl?"Naskh":"Helvetica-Bold").fontSize(14).text("IFRANE FOR YOU",48,36,{characterSpacing:2});
  doc.fillColor("#F7F3EB").font(rtl?"Naskh":"Helvetica").fontSize(22).text(t.documentTitle,48,64,{width:499,align});
  doc.y=148;
  write(`${t.reference} : ${reference}`,14,"#273D34",true);doc.moveDown(.5);
  const status=row.status==="PENDING"?t.pending:row.status==="CONFIRMED"?t.confirmed:row.status==="CANCELLED"?t.cancelled:row.status==="COMPLETED"?t.completed:String(row.status);
  write(`${t.status} : ${status}`,11,row.status==="PENDING"?"#B77552":"#273D34",true);doc.moveDown();
  if(row.status==="PENDING")write(t.documentPending,10,"#8D5A3E");
  doc.moveDown();
  write(t.documentStay,13,"#273D34",true);doc.moveDown(.35);
  const names=row.type_names as Record<string,string>;
  write(`${names?.[locale]??names?.fr??""} · ${row.check_in_text} → ${row.check_out_text}`);
  write(`${t.guests} : ${row.guest_count}`);doc.moveDown();
  write(t.documentContact,13,"#273D34",true);doc.moveDown(.35);
  write(`${t.name} : ${String(row.customer_name)}`);write(`${t.email} : ${String(row.customer_email)}`);write(`${t.phone} : ${String(row.customer_phone)}`);doc.moveDown();
  if(selections.length){
    const meals=selections.filter(x=>x.kind==="MEAL"),services=selections.filter(x=>x.kind==="SERVICE");
    for(const [items,label] of [[meals,t.documentMeals],[services,t.documentServices]] as const){if(items.length){write(label,13,"#273D34",true);doc.moveDown(.35);for(const item of items){const itemNames=item.option_name_snapshot as Record<string,string>;write(`${itemNames?.[locale]??itemNames?.fr??""} × ${item.quantity} — ${item.line_total} ${String(item.currency).trim()}`)}doc.moveDown()}}
  }
  doc.moveTo(48,doc.y).lineTo(547,doc.y).strokeColor("#D8C5A6").stroke();doc.moveDown();
  if(row.total_amount!==null){
    write(`${t.documentLodgingTotal} : ${row.lodging_total} ${String(row.price_currency).trim()}`);
    write(`${t.documentOptionsTotal} : ${row.options_total} ${String(row.price_currency).trim()}`);
    write(`${t.documentTotal} : ${row.total_amount} ${String(row.price_currency).trim()}`,14,"#273D34",true);
  }else write(t.documentNoPrice);
  doc.moveDown(2);write(t.documentFooter,9,"#77776D");
  doc.end();
  const pdf=await complete;
  return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="ifrane-for-you-${reference}.pdf"`,"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
}
