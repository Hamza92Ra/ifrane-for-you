import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Inquiry } from "@/components/Inquiry";
import { isStaySlug, stays } from "@/content/stays";
import { displayStay } from "@/server/photos";
import { getDictionary, isLocale } from "@/i18n";
import { bookingText } from "@/i18n/booking";
import { businessText, customStay, publicType } from "@/server/catalog";

// Room pages depend on the live catalog; render on request rather than during deployment.
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  if (!isStaySlug(slug)) {
    const custom=await customStay(slug,locale);
    if(!custom)return {};
    return {title:custom.name,description:custom.description,alternates:{canonical:`/${locale}/stays/${slug}`,languages:{fr:`/fr/stays/${slug}`,en:`/en/stays/${slug}`,ar:`/ar/stays/${slug}`}}};
  }
  const t = getDictionary(locale);
  const copy = t[slug];
  return { title: copy.label, description: copy.heroBody, alternates: { canonical: `/${locale}/stays/${slug}`, languages: { fr: `/fr/stays/${slug}`, en: `/en/stays/${slug}`, ar: `/ar/stays/${slug}` } }, openGraph: { title: copy.label, description: copy.heroBody, images: [{ url: stays[slug].hero.src, width: stays[slug].hero.width, height: stays[slug].hero.height, alt: stays[slug].hero.alt[locale] ?? stays[slug].hero.alt.fr }] } };
}

export default async function StayPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!isStaySlug(slug)) {
    const [custom,business]=await Promise.all([customStay(slug,locale),businessText(locale)]);
    if(!custom)notFound();
    const t=getDictionary(locale);
    return <><SiteHeader locale={locale} path={`/stays/${slug}`}/><main id="main" className="detail-main"><section className="detail-hero"><div className="detail-hero-image"><Image src={custom.hero.src} alt={custom.hero.alt[locale]??custom.hero.alt.fr} fill sizes="(max-width: 800px) 100vw, 60vw" priority/></div><div className="detail-hero-copy"><Link className="back-link" href={`/${locale}/#stays`}><span aria-hidden="true">←</span>{t.backToStays}</Link><p className="eyebrow">{custom.name}</p><h1>{custom.name}</h1><p>{custom.description}</p><Link className="button button--dark" href={`/${locale}/book?stay=${encodeURIComponent(slug)}`}>{bookingText[locale].title}<span aria-hidden="true">↗</span></Link></div></section><section className="detail-gallery section-pad"><div className="page-container"><div className="detail-section-heading"><p className="eyebrow">{t.detailsEyebrow}</p><h2 className="display-title">{t.detailsPhotos}</h2></div><PhotoGallery photos={custom.photos} locale={locale} variant="detail"/></div></section><section className="detail-information section-pad page-container"><div><p className="eyebrow">{t.detailsAmenities}</p><h2 className="display-title">{t.detailsOverview}</h2></div><div className="info-content"><ul>{custom.amenities.map(a=><li key={a}>{a}</li>)}</ul><div className="location-note"><h3>{t.detailsLocation}</h3><p>{business?.location||t.detailsLocationPending}</p></div></div></section><Inquiry locale={locale} detail stay={slug}/></main></>;
  }
  const t = getDictionary(locale);
  const stay = await displayStay(slug);
  const copy = t[slug];
  const [managed, business] = await Promise.all([publicType(slug, locale),businessText(locale)]);
  const amenities = managed?.amenities?.length ? managed.amenities : copy.features;
  return <>
    <SiteHeader locale={locale} path={`/stays/${slug}`} />
    <main id="main" className="detail-main">
      <section className={`detail-hero detail-hero--${slug}`}>
        <div className="detail-hero-image"><Image src={stay.hero.src} alt={stay.hero.alt[locale] ?? stay.hero.alt.fr} fill sizes="(max-width: 800px) 100vw, 60vw" priority /></div>
        <div className="detail-hero-copy"><Link className="back-link" href={`/${locale}/#stays`}><span aria-hidden="true">←</span>{t.backToStays}</Link><p className="eyebrow">{managed?.name||copy.label}</p><h1>{copy.heroTitle}</h1><p>{copy.heroBody}</p><Link className="button button--dark" href={`/${locale}/book?stay=${slug}`}>{bookingText[locale].title}<span aria-hidden="true">↗</span></Link></div>
      </section>
      <section className="detail-overview section-pad page-container" data-reveal><p className="eyebrow">{t.detailsOverview}</p><p className="detail-overview-text">{managed?.description||copy.overview}</p><span className="detail-asterisk" aria-hidden="true">✳</span></section>
      <section className="detail-gallery section-pad"><div className="page-container"><div className="detail-section-heading" data-reveal><p className="eyebrow">{t.detailsEyebrow}</p><h2 className="display-title">{t.detailsPhotos}</h2></div><PhotoGallery photos={stay.photos} locale={locale} variant="detail" /></div></section>
      <section className="detail-information section-pad page-container"><div data-reveal><p className="eyebrow">{managed?.amenities?.length?t.detailsAmenities:t.detailsFeatures}</p><h2 className="display-title">{t.detailsOverview}</h2>{!managed?.amenities?.length&&<p className="info-note">{t.detailsFeaturesNote}</p>}</div><div className="info-content" data-reveal><ul>{amenities.map((feature) => <li key={feature}>{feature}</li>)}</ul><div className="location-note"><h3>{t.detailsLocation}</h3><p>{business?.location||t.detailsLocationPending}</p></div></div></section>
      <Inquiry locale={locale} detail stay={slug}/>
    </main>
  </>;
}
