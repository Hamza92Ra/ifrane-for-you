import Link from "next/link";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";
import { publicSettings } from "@/server/settings";
import { SocialIcon } from "@/components/SocialIcon";
export async function SiteFooter({ locale, settings }: { locale: Locale; settings: Awaited<ReturnType<typeof publicSettings>> }) {
  const t = getDictionary(locale);
  const contact = settings;
  return <footer className="site-footer"><div className="footer-inner">
    <div><Link href={`/${locale}`} className="footer-brand">{t.brand}</Link><p>{t.footerTagline}</p></div>
    <div className="footer-right"><div className="footer-social" aria-label="Réseaux sociaux">{contact.instagram&&<a href={contact.instagram} target="_blank" rel="noopener noreferrer" aria-label={t.socialInstagram} title={t.socialInstagram}><SocialIcon network="instagram"/></a>}{contact.facebook&&<a href={contact.facebook} target="_blank" rel="noopener noreferrer" aria-label={t.socialFacebook} title={t.socialFacebook}><SocialIcon network="facebook"/></a>}</div><p>{t.footerNote}</p><span>© {new Date().getFullYear()} {t.brand}</span></div>
  </div></footer>;
}
