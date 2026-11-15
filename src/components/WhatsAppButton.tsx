"use client";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";
import { getBookingUrl } from "@/content/booking";

export function WhatsAppButton({locale,number}:{locale:Locale;number:string|null}) {
  if (!number) return null;
  const t = getDictionary(locale);
  return <a className="whatsapp-float" href={getBookingUrl(locale,undefined,number)} target="_blank" rel="noopener noreferrer" aria-label={`${t.whatsappLabel} · ${t.inquiryButton}`}>
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 .8A15.1 15.1 0 0 0 3 23.5L.9 31l7.7-2a15.2 15.2 0 1 0 7.4-28.2Zm0 27.6a12.3 12.3 0 0 1-6.3-1.7l-.5-.3-4.5 1.2 1.2-4.4-.3-.5a12.5 12.5 0 1 1 10.4 5.7Zm6.8-9.3c-.4-.2-2.3-1.1-2.6-1.2-.4-.1-.6-.2-.9.2-.3.4-1 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8l.6-.7.4-.6c.1-.2 0-.5 0-.7l-1.2-2.8c-.3-.7-.6-.6-.9-.6h-.8c-.3 0-.7.1-1 .5-.4.4-1.3 1.3-1.3 3.2s1.3 3.7 1.5 3.9c.2.3 2.6 4 6.4 5.6.9.4 1.6.6 2.1.7.9.3 1.7.2 2.3.1.7-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.2-.3-.3-.7-.5Z"/></svg>
  </a>;
}
