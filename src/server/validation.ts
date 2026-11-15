import { z } from "zod";

const isoDate = z.iso.date();
export const staySlug = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const selectedOptionSchema = z.object({ id: z.uuid(), quantity: z.coerce.number().int().min(1).max(20) });
export const selectedOptionsSchema = z.array(selectedOptionSchema).max(20).default([]).superRefine((options,ctx)=>{
  if(new Set(options.map(option=>option.id)).size!==options.length)ctx.addIssue({code:"custom",message:"DUPLICATE_OPTIONS"});
});
export const availabilitySchema = z.object({ type: staySlug, checkIn: isoDate, checkOut: isoDate, guests: z.coerce.number().int().min(1).max(20).optional() }).superRefine((v, ctx) => {
  if (v.checkOut <= v.checkIn) ctx.addIssue({ code: "custom", message: "INVALID_DATES", path: ["checkOut"] });
});
export const bookingSchema = availabilitySchema.safeExtend({
  guests: z.coerce.number().int().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/),
  selectedOptions: selectedOptionsSchema,
  requestKey: z.uuid(),
  privacyAccepted: z.literal(true)
});
export type BookingInput = z.infer<typeof bookingSchema>;

export function validStayDates(checkIn: string, checkOut: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return checkIn >= today && checkOut > checkIn;
}
