import Link from "next/link";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";
import { publicSettings } from "@/server/settings";
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const contact = await publicSettings();
  return <footer className="site-footer"><div className="footer-inner">
    <div><Link href={`/${locale}`} className="footer-brand">{t.brand}</Link><p>{t.footerTagline}</p></div>
    <div className="footer-right"><div className="footer-social">{contact.instagram&&<a href={contact.instagram} target="_blank" rel="noopener noreferrer">{t.socialInstagram} ↗</a>}{contact.facebook&&<a href={contact.facebook} target="_blank" rel="noopener noreferrer">{t.socialFacebook} ↗</a>}</div><p>{t.footerNote}</p><span>© {new Date().getFullYear()} {t.brand}</span></div>
  </div></footer>;
}
