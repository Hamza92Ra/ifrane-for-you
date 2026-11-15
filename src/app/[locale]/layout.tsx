import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, getDictionary } from "@/i18n";
import { SiteFooter } from "@/components/SiteFooter";
import { sansFont, serifFont, arabicFont } from "@/fonts";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { publicSettings } from "@/server/settings";
import { MobileBookingShortcut } from "@/components/MobileBookingShortcut";
import "../globals.css";

export function generateStaticParams() { return locales.map((locale) => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
    title: { default: t.brand, template: `%s | ${t.brand}` },
    description: t.heroBody,
    alternates: { canonical: `/${locale}`, languages: { fr: "/fr", en: "/en", ar: "/ar" } },
    openGraph: { title: t.brand, description: t.heroBody, type: "website", locale: locale === "fr" ? "fr_FR" : locale === "ar" ? "ar_MA" : "en_US", images: [{ url: "/images/dome/sunset-exterior.webp", width: 1024, height: 683, alt: t.dome.label }] },
    robots: { index: true, follow: true }
  };
}
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const settings=await publicSettings();
  return <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}><body className={`${serifFont.variable} ${sansFont.variable} ${arabicFont.variable}`}><a className="skip-link" href="#main">{t.skip}</a>{children}<SiteFooter locale={locale} settings={settings}/><MobileBookingShortcut locale={locale}/><WhatsAppButton locale={locale} number={settings.whatsapp}/></body></html>;
}
