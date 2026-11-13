import "server-only";
import { db } from "./db";
import type { BookingInput } from "./validation";

export type AvailabilityResult = { available: number; maxGuests: number | null; configured: boolean };
export async function availability(type: string, checkIn: string, checkOut: string): Promise<AvailabilityResult> {
  const sql = db();
  const rows = await sql`select t.max_guests,
    (select count(*)::integer from public.accommodation_units u
      where u.type_id = t.id and u.active
      and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${checkIn}::date,${checkOut}::date,'[)'))
      and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${checkIn}::date,${checkOut}::date,'[)'))
    ) as available
    from public.accommodation_types t where t.slug = ${type} and t.published`;
  if (!rows.length) return { available: 0, maxGuests: null, configured: false };
  return { available: Number(rows[0].available), maxGuests: rows[0].max_guests, configured: rows[0].max_guests !== null };
}

export type PendingResult = { reference: string; status: "PENDING"; type: string; checkIn: string; checkOut: string; guests: number };
export async function createPendingBooking(input: BookingInput): Promise<PendingResult | "UNAVAILABLE" | "NOT_CONFIGURED" | "CAPACITY" | "ALREADY_PROCESSED"> {
  const sql = db();
  return sql.begin(async (tx) => {
    const existing = await tx`select reference, status from public.reservations where request_key = ${input.requestKey}::uuid`;
    if (existing.length) return existing[0].status === "PENDING" ? { reference: existing[0].reference, status: "PENDING" as const, type: input.type, checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests } : "ALREADY_PROCESSED" as const;
    const types = await tx`select id, max_guests from public.accommodation_types where slug = ${input.type} and published for update`;
    if (!types.length || types[0].max_guests === null) return "NOT_CONFIGURED" as const;
    if (input.guests > Number(types[0].max_guests)) return "CAPACITY" as const;
    const units = await tx`select u.id from public.accommodation_units u where u.type_id = ${types[0].id}::uuid and u.active
      and not exists (select 1 from public.reservations r where r.unit_id = u.id and r.status in ('CONFIRMED','COMPLETED') and r.stay && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      and not exists (select 1 from public.availability_blocks b where b.unit_id = u.id and b.active and b.period && daterange(${input.checkIn}::date,${input.checkOut}::date,'[)'))
      order by u.unit_code limit 1 for update of u`;
    if (!units.length) return "UNAVAILABLE" as const;
    const inserted = await tx`insert into public.reservations (type_id, check_in, check_out, guest_count, customer_name, customer_email, customer_phone, request_key)
      values (${types[0].id}::uuid, ${input.checkIn}::date, ${input.checkOut}::date, ${input.guests}, ${input.name}, ${input.email}, ${input.phone}, ${input.requestKey}::uuid)
      returning reference`;
    return { reference: inserted[0].reference, status: "PENDING" as const, type: input.type, checkIn: input.checkIn, checkOut: input.checkOut, guests: input.guests };
  });
}
