import { NextRequest, NextResponse } from "next/server";
import { availabilitySchema, selectedOptionsSchema, validStayDates } from "@/server/validation";
import { availability, BookingPricingError } from "@/server/availability";
import { databaseConfigured } from "@/server/db";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params=Object.fromEntries(request.nextUrl.searchParams);
  const parsed=availabilitySchema.safeParse(params);
  const selectedRaw=params.selectedOptions??"[]";
  if(selectedRaw.length>4000)return NextResponse.json({error:"INVALID_OPTIONS"},{status:400});
  let optionValue:unknown;
  try{optionValue=JSON.parse(selectedRaw)}catch{return NextResponse.json({error:"INVALID_OPTIONS"},{status:400})}
  const options=selectedOptionsSchema.safeParse(optionValue);
  if(!parsed.success||!validStayDates(parsed.data.checkIn,parsed.data.checkOut))return NextResponse.json({error:"INVALID_DATES"},{status:400});
  if(!options.success)return NextResponse.json({error:"INVALID_OPTIONS"},{status:400});
  if(!databaseConfigured())return NextResponse.json({error:"NOT_CONFIGURED"},{status:503});
  try{
    const result=await availability(parsed.data.type,parsed.data.checkIn,parsed.data.checkOut,parsed.data.guests??1,options.data);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof BookingPricingError)return NextResponse.json({error:error.code},{status:422});
    return NextResponse.json({error:"SERVICE_UNAVAILABLE"},{status:503});
  }
}
