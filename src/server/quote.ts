export type PricingBasis = "PER_BOOKING" | "PER_NIGHT" | "PER_PERSON" | "PER_PERSON_PER_NIGHT" | "PER_ITEM";
export type QuoteOption = { id:string; name:Record<string,string>; kind:"MEAL"|"SERVICE"; pricingBasis:PricingBasis; unitPrice:number; currency:string; quantity:number };
export type QuoteLine = { id:string; name:Record<string,string>; kind:"MEAL"|"SERVICE"; pricingBasis:PricingBasis; quantity:number; unitPrice:number; lineTotal:number; currency:string };
export type BookingQuote = { nights:number; lodgingTotal:number; optionsTotal:number; total:number; currency:string; lines:QuoteLine[] };
const minor=(amount:number)=>Math.round(amount*100);
const major=(amount:number)=>Math.round(amount)/100;

/** Computes a complete quote only when all nightly rates exist and every line uses one currency. */
export function buildBookingQuote(input:{nightlyRates:Array<{amount:number;currency:string}|null>;guests:number;options:QuoteOption[]}):BookingQuote|null {
  const nights=input.nightlyRates.length;
  if(nights<1||input.guests<1||input.nightlyRates.some(rate=>!rate))return null;
  const rates=input.nightlyRates as Array<{amount:number;currency:string}>;
  const currency=rates[0].currency.trim().toUpperCase();
  if(!currency||rates.some(rate=>rate.currency.trim().toUpperCase()!==currency))return null;
  if(input.options.some(option=>option.currency.trim().toUpperCase()!==currency))return null;
  const lodgingMinor=rates.reduce((sum,rate)=>sum+minor(rate.amount),0);
  const lines=input.options.map(option=>{
    const multiplier=option.pricingBasis==="PER_BOOKING"?1:
      option.pricingBasis==="PER_NIGHT"?nights:
      option.pricingBasis==="PER_PERSON"?input.guests:
      option.pricingBasis==="PER_PERSON_PER_NIGHT"?input.guests*nights:
      option.quantity;
    const total=minor(option.unitPrice)*multiplier;
    return {id:option.id,name:option.name,kind:option.kind,pricingBasis:option.pricingBasis,quantity:option.quantity,unitPrice:major(minor(option.unitPrice)),lineTotal:major(total),currency};
  });
  const optionsMinor=lines.reduce((sum,line)=>sum+minor(line.lineTotal),0);
  return {nights,lodgingTotal:major(lodgingMinor),optionsTotal:major(optionsMinor),total:major(lodgingMinor+optionsMinor),currency,lines};
}
