import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import type { BookingInput, selectedOptionSchema } from "./validation";
import type { z } from "zod";
import { buildBookingQuote, type QuoteLine, type QuoteOption } from "./quote";

type Query = ReturnType<typeof db> | postgres.TransactionSql;
type SelectedOption = z.infer<typeof selectedOptionSchema>;
export class BookingPricingError extends Error { constructor(public code:"INVALID_OPTIONS"|"PRICE_NOT_CONFIGURED"){super(code)} }
export type PriceEstimate = {
  nights:number; currency:string; total:number; lodgingTotal:number; optionsTotal:number;
  averageNightly:number; basePrice:number|null; hasSpecialRates:boolean; lines:QuoteLine[];
};
function addUtcDays(date:string,offset:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)}

export async function calculatePriceWith(query:Query,typeSlug:string,checkIn:string,checkOut:string,guests:number,selectedOptions:SelectedOption[]):Promise<PriceEstimate|null>{
  const types=await query`select id,base_price,currency from public.accommodation_types where slug=${typeSlug} and published`;
  if(!types.length)return null;
  const {id:typeId,base_price:basePrice,currency:baseCurrency}=types[0];
  const start=new Date(`${checkIn}T00:00:00Z`),end=new Date(`${checkOut}T00:00:00Z`);
  const nights=Math.round((end.getTime()-start.getTime())/86400000);
  if(nights<=0)return null;
  const rules=await query`select start_date::text as start_date,end_date::text as end_date,nightly_price,currency,priority
    from public.pricing_rules where type_id=${typeId}::uuid and active
    and daterange(start_date,end_date,'[)') && daterange(${checkIn}::date,${checkOut}::date,'[)')
    order by priority desc,created_at desc`;
  const rates=Array.from({length:nights},(_,index)=>{
    const day=addUtcDays(checkIn,index);
    const rule=rules.find(item=>day>=item.start_date&&day<item.end_date);
    if(rule)return {amount:Number(rule.nightly_price),currency:String(rule.currency).trim()};
    if(basePrice!==null)return {amount:Number(basePrice),currency:String(baseCurrency).trim()};
    return null;
  });
  const options:QuoteOption[]=[];
  for(const selection of selectedOptions){
    const found=await query`select id,names,kind,pricing_basis,unit_price,currency,type_id from public.booking_options
      where id=${selection.id}::uuid and active and published and (type_id is null or type_id=${typeId}::uuid)`;
    if(!found.length)throw new BookingPricingError("INVALID_OPTIONS");
    const option=found[0];
    if(option.pricing_basis!=="PER_ITEM"&&selection.quantity!==1)throw new BookingPricingError("INVALID_OPTIONS");
    options.push({id:String(option.id),name:option.names,kind:option.kind,pricingBasis:option.pricing_basis,unitPrice:Number(option.unit_price),currency:String(option.currency).trim(),quantity:selection.quantity});
  }
  const quote=buildBookingQuote({nightlyRates:rates,guests,options});
  if(!quote)return null;
  return {...quote,averageNightly:Math.round(quote.lodgingTotal*100/quote.nights)/100,basePrice:basePrice===null?null:Number(basePrice),hasSpecialRates:rules.length>0};
}
export async function calculatePrice(typeSlug:string,checkIn:string,checkOut:string,guests=1,selectedOptions:SelectedOption[]=[]):Promise<PriceEstimate|null>{
  return calculatePriceWith(db(),typeSlug,checkIn,checkOut,guests,selectedOptions);
}

export type AvailabilityResult={available:number;maxGuests:number|null;configured:boolean;priceConfigured:boolean;priceEstimate:PriceEstimate|null};
export async function availability(type:string,checkIn:string,checkOut:string,guests=1,selectedOptions:SelectedOption[]=[]):Promise<AvailabilityResult>{
  const sql=db();
  const rows=await sql`select t.max_guests,
    (select count(*)::integer from public.accommodation_units u where u.type_id=t.id and u.active
      and not exists(select 1 from public.reservations r where r.unit_id=u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${checkIn}::date,${checkOut}::date,'[)'))
      and not exists(select 1 from public.availability_blocks b where b.unit_id=u.id and b.active and b.period && daterange(${checkIn}::date,${checkOut}::date,'[)'))
    ) as available from public.accommodation_types t where t.slug=${type} and t.published`;
  if(!rows.length)return {available:0,maxGuests:null,configured:false,priceConfigured:false,priceEstimate:null};
  const estimate=await calculatePrice(type,checkIn,checkOut,guests,selectedOptions);
  return {available:Number(rows[0].available),maxGuests:rows[0].max_guests,configured:rows[0].max_guests!==null,priceConfigured:estimate!==null,priceEstimate:estimate};
}

export type PendingResult={
  id:string;reference:string;documentToken:string;status:"PENDING";type:string;checkIn:string;checkOut:string;guests:number;priceEstimate:PriceEstimate;
};
export async function createPendingBooking(input:BookingInput,documentTokenFor:(id:string,requestKey:string)=>string):Promise<PendingResult|"UNAVAILABLE"|"NOT_CONFIGURED"|"CAPACITY"|"PRICE_NOT_CONFIGURED"|"ALREADY_PROCESSED">{
  const sql=db();
  return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${input.requestKey},0))`;
    const existing=await tx`select r.id,r.reference,r.status,r.request_key,r.check_in::text as check_in,r.check_out::text as check_out,r.guest_count,r.customer_name,r.customer_email,r.customer_phone,r.price_breakdown,t.slug
      from public.reservations r join public.accommodation_types t on t.id=r.type_id where r.request_key=${input.requestKey}::uuid`;
    if(existing.length){
      const row=existing[0];
      if(row.customer_email!==input.email||row.customer_name!==input.name||row.customer_phone!==input.phone||row.slug!==input.type||row.check_in!==input.checkIn||row.check_out!==input.checkOut||Number(row.guest_count)!==input.guests)return "ALREADY_PROCESSED" as const;
      if(row.status!=="PENDING")return "ALREADY_PROCESSED" as const;
      const quote=row.price_breakdown as PriceEstimate|null;
      if(!quote)return "PRICE_NOT_CONFIGURED" as const;
      return {id:String(row.id),reference:String(row.reference),documentToken:documentTokenFor(String(row.id),String(row.request_key)),status:"PENDING" as const,type:String(row.slug),checkIn:row.check_in,checkOut:row.check_out,guests:Number(row.guest_count),priceEstimate:quote};
    }
    const types=await tx`select id,max_guests from public.accommodation_types where slug=${input.type} and published for update`;
    if(!types.length||types[0].max_guests===null)return "NOT_CONFIGURED" as const;
    if(input.guests>Number(types[0].max_guests))return "CAPACITY" as const;
    const quote=await calculatePriceWith(tx,input.type,input.checkIn,input.checkOut,input.guests,input.selectedOptions);
    if(!quote)return "PRICE_NOT_CONFIGURED" as const;
    const units=await tx`select u.id from public.accommodation_units u where u.type_id=${types[0].id}::uuid and u.active
      and not exists(select 1 from public.reservations r where r.unit_id=u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      and not exists(select 1 from public.availability_blocks b where b.unit_id=u.id and b.active and b.period && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      order by u.unit_code limit 1 for update of u`;
    if(!units.length)return "UNAVAILABLE" as const;
    const breakdown={lodgingTotal:quote.lodgingTotal,optionsTotal:quote.optionsTotal,total:quote.total,currency:quote.currency,nights:quote.nights,lines:quote.lines};
    const inserted=await tx`insert into public.reservations (type_id,check_in,check_out,guest_count,customer_name,customer_email,customer_phone,request_key,internal_note,lodging_total,options_total,total_amount,price_currency,price_breakdown,deposit_percent_snapshot)
      values (${types[0].id}::uuid,${input.checkIn}::date,${input.checkOut}::date,${input.guests},${input.name},${input.email},${input.phone},${input.requestKey}::uuid,null,
        ${quote.lodgingTotal},${quote.optionsTotal},${quote.total},${quote.currency},${tx.json(breakdown)},(select deposit_percent from public.business_settings where id=1))
      returning id,reference`;
    const id=String(inserted[0].id);
    for(const line of quote.lines){
      await tx`insert into public.reservation_option_selections(reservation_id,option_id,option_name_snapshot,kind,pricing_basis,quantity,unit_price,line_total,currency)
        values(${id}::uuid,${line.id}::uuid,${tx.json(line.name)},${line.kind}::public.booking_option_kind,${line.pricingBasis}::public.booking_pricing_basis,${line.quantity},${line.unitPrice},${line.lineTotal},${line.currency})`;
    }
    return {id,reference:String(inserted[0].reference),documentToken:documentTokenFor(id,input.requestKey),status:"PENDING" as const,type:input.type,checkIn:input.checkIn,checkOut:input.checkOut,guests:input.guests,priceEstimate:quote};
  });
}
