import "server-only";
import { db } from "./db";
import type { BookingInput } from "./validation";

export type PriceEstimate = {
  nights: number;
  currency: string;
  total: number;
  averageNightly: number;
  basePrice: number | null;
  hasSpecialRates: boolean;
};

export async function calculatePrice(typeSlug: string, checkIn: string, checkOut: string): Promise<PriceEstimate | null> {
  const sql = db();
  const types = await sql`select id, base_price, currency from public.accommodation_types where slug = ${typeSlug} and published`;
  if (!types.length) return null;
  const { id: typeId, base_price, currency: baseCurrency } = types[0];

  const inDate = new Date(`${checkIn}T00:00:00Z`);
  const outDate = new Date(`${checkOut}T00:00:00Z`);
  const nights = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24));
  if (nights <= 0) return null;

  const rules = await sql`select start_date::text as start_date, end_date::text as end_date, nightly_price, currency, priority
    from public.pricing_rules
    where type_id = ${typeId}::uuid and active
    and daterange(start_date, end_date, '[)') && daterange(${checkIn}::date, ${checkOut}::date, '[)')
    order by priority desc, created_at desc`;

  if (base_price === null && rules.length === 0) return null;

  let total = 0;
  let hasSpecialRates = false;
  const currency = (baseCurrency ? String(baseCurrency).trim() : "") || (rules[0]?.currency ? String(rules[0].currency).trim() : "") || "MAD";

  for (let i = 0; i < nights; i++) {
    const cur = new Date(inDate);
    cur.setUTCDate(cur.getUTCDate() + i);
    const dayStr = cur.toISOString().slice(0, 10);
    const match = rules.find((r) => dayStr >= r.start_date && dayStr < r.end_date);
    if (match) {
      // Never add rates expressed in different currencies without an exchange rate.
      // An incomplete or mixed-currency estimate is safer than a misleading total.
      if (String(match.currency).trim() !== currency) return null;
      total += Number(match.nightly_price);
      hasSpecialRates = true;
    } else if (base_price !== null) {
      total += Number(base_price);
    } else {
      return null;
    }
  }

  return {
    nights,
    currency,
    total,
    averageNightly: Math.round(total / nights),
    basePrice: base_price !== null ? Number(base_price) : null,
    hasSpecialRates
  };
}

export type AvailabilityResult = {
  available: number;
  maxGuests: number | null;
  configured: boolean;
  priceEstimate: PriceEstimate | null;
};

export async function availability(type: string, checkIn: string, checkOut: string): Promise<AvailabilityResult> {
  const sql = db();
  const rows = await sql`select t.max_guests,
    (select count(*)::integer from public.accommodation_units u
      where u.type_id = t.id and u.active
      and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${checkIn}::date,${checkOut}::date,'[)'))
      and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${checkIn}::date,${checkOut}::date,'[)'))
    ) as available
    from public.accommodation_types t where t.slug = ${type} and t.published`;
  if (!rows.length) return { available: 0, maxGuests: null, configured: false, priceEstimate: null };
  const priceEstimate = await calculatePrice(type, checkIn, checkOut).catch(() => null);
  return {
    available: Number(rows[0].available),
    maxGuests: rows[0].max_guests,
    configured: rows[0].max_guests !== null,
    priceEstimate
  };
}

export type PendingResult = {
  reference: string;
  status: "PENDING";
  type: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  priceEstimate?: PriceEstimate | null;
};

export async function createPendingBooking(input: BookingInput): Promise<PendingResult | "UNAVAILABLE" | "NOT_CONFIGURED" | "CAPACITY" | "ALREADY_PROCESSED"> {
  const sql = db();
  const priceEstimate = await calculatePrice(input.type, input.checkIn, input.checkOut).catch(() => null);
  return sql.begin(async (tx) => {
    const existing = await tx`select reference, status from public.reservations where request_key = ${input.requestKey}::uuid`;
    if (existing.length) {
      return existing[0].status === "PENDING"
        ? { reference: existing[0].reference, status: "PENDING" as const, type: input.type, checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests, priceEstimate }
        : ("ALREADY_PROCESSED" as const);
    }
    const types = await tx`select id, max_guests from public.accommodation_types where slug = ${input.type} and published for update`;
    if (!types.length || types[0].max_guests === null) return "NOT_CONFIGURED" as const;
    if (input.guests > Number(types[0].max_guests)) return "CAPACITY" as const;
    const units = await tx`select u.id from public.accommodation_units u where u.type_id = ${types[0].id}::uuid and u.active
      and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      order by u.unit_code limit 1 for update of u`;
    if (!units.length) return "UNAVAILABLE" as const;

    const note = priceEstimate ? `Tarif estimé : ${priceEstimate.total} ${priceEstimate.currency} (${priceEstimate.nights} nuits)` : null;
    const inserted = await tx`insert into public.reservations (type_id, check_in, check_out, guest_count, customer_name, customer_email, customer_phone, request_key, internal_note)
      values (${types[0].id}::uuid, ${input.checkIn}::date, ${input.checkOut}::date, ${input.guests}, ${input.name}, ${input.email}, ${input.phone}, ${input.requestKey}::uuid, ${note})
      returning reference`;
    return {
      reference: inserted[0].reference,
      status: "PENDING" as const,
      type: input.type,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      priceEstimate
    };
  });
}
