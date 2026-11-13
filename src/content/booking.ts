import type { StaySlug } from "@/content/stays";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";

export const contact = {
  phoneDisplay: "+212 679 941 798",
  instagram: "https://www.instagram.com/ifrane.foryou/",
  facebook: "https://www.facebook.com/profile.php?id=61596139515509"
} as const;

export function getBookingUrl(locale: Locale, stay?: StaySlug, phone: string = contact.phoneDisplay): string {
  const t = getDictionary(locale);
  const message = t.whatsappMessage.replace("{stay}", stay ? t[stay].label.toLowerCase() : t.whatsappGeneral);
  const url = new URL(`https://wa.me/${phone.replace(/\D/g, "")}`);
  url.searchParams.set("text", message);
  return url.toString();
}
