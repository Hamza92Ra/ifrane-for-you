import Link from "next/link";
import type {Locale} from "@/i18n";
import {bookingText} from "@/i18n/booking";

export function MobileBookingShortcut({locale}:{locale:Locale}){
  return <Link className="mobile-booking-shortcut" href={`/${locale}/book`}><span>{bookingText[locale].title}</span><span aria-hidden="true">→</span></Link>;
}
