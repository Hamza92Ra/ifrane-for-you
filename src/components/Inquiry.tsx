import Link from "next/link";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";
import { getBookingUrl } from "@/content/booking";
import { publicSettings } from "@/server/settings";
import { bookingText } from "@/i18n/booking";
import { SocialIcon } from "@/components/SocialIcon";
export async function Inquiry({ locale, detail = false, stay }: { locale: Locale; detail?: boolean; stay?: string }) {
  const t = getDictionary(locale);
  const settings = await publicSettings();
  const url = settings.whatsapp ? getBookingUrl(locale, stay === "dome" || stay === "cabin" ? stay : undefined, settings.whatsapp) : null;
  return <section id="inquire" className={`inquiry-section ${detail ? "inquiry-section--detail" : ""}`}>
    <div className="inquiry-orbit" aria-hidden="true"/>
    <div className="inquiry-content" data-reveal>
      <p className="eyebrow eyebrow--light">{t.inquiryEyebrow}</p>
      <h2>{detail ? t.detailsInquiry : t.inquiryTitle}</h2>
      <p>{detail ? t.detailsInquiryBody : t.inquiryBody}</p>
      <Link className="button button--light" href={`/${locale}/book${stay?`?stay=${stay}`:""}`}>{bookingText[locale].title}<span aria-hidden="true">↗</span></Link>
      {url && <a className="inquiry-instagram" href={url} target="_blank" rel="noopener noreferrer">{t.whatsappLabel}<span aria-hidden="true">↗</span></a>}
      {settings.whatsapp && <p className="inquiry-phone">{t.whatsappLabel} · {settings.whatsapp}</p>}
      {settings.instagram && <a className="inquiry-instagram" href={settings.instagram} target="_blank" rel="noopener noreferrer"><SocialIcon network="instagram"/>{t.inquiryInstagram}</a>}
      {!detail && <div className="inquiry-stays"><Link href={`/${locale}/stays/dome`}>{t.dome.label} <span aria-hidden="true">↗</span></Link><Link href={`/${locale}/stays/cabin`}>{t.cabin.label} <span aria-hidden="true">↗</span></Link></div>}
    </div>
  </section>;
}
