import "server-only";
import { contact } from "@/content/booking";
import { databaseConfigured, db } from "./db";

export async function publicSettings() {
  if (!databaseConfigured()) return { whatsapp: contact.phoneDisplay, instagram: contact.instagram, facebook: contact.facebook };
  try {
    const rows = await db()`select whatsapp_e164, instagram_url, facebook_url from public.business_settings where id=1`;
    return { whatsapp: rows[0]?.whatsapp_e164 as string | null, instagram: rows[0]?.instagram_url as string | null, facebook: rows[0]?.facebook_url as string | null };
  } catch { return { whatsapp: null, instagram: null, facebook: null }; }
}
