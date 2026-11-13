import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/PhotoGallery";
import { SiteHeader } from "@/components/SiteHeader";
import { Inquiry } from "@/components/Inquiry";
import { displayStay } from "@/server/photos";
import { getDictionary, isLocale } from "@/i18n";
import { bookingText } from "@/i18n/booking";
import { otherStays } from "@/server/catalog";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.brand, description: t.heroBody, alternates: { canonical: `/${locale}`, languages: { fr: "/fr", en: "/en", ar: "/ar" } } };
}
export const revalidate = 60;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [dome, cabin, more] = await Promise.all([displayStay("dome"), displayStay("cabin"), otherStays(locale)]);
  const localHero = dome.hero.src === "/images/dome/sunset-exterior.webp";
  const homeGallery = [dome.photos[0], cabin.photos[3], dome.photos[1], cabin.photos[4], dome.photos[7], cabin.photos[5]];
  return <>
    {localHero&&<><link rel="preload" as="image" href="/images/dome/sunset-exterior-mobile.webp" media="(max-width: 600px)" fetchPriority="high"/><link rel="preload" as="image" href={dome.hero.src} media="(min-width: 601px)" fetchPriority="high"/></>}
    <SiteHeader locale={locale} overlay />
    <main id="main">
      <section className="home-hero" aria-labelledby="home-title">
        {localHero?<picture><source media="(max-width: 600px)" srcSet="/images/dome/sunset-exterior-mobile.webp"/><img className="home-hero-image" src={dome.hero.src} alt={dome.hero.alt[locale] ?? dome.hero.alt.fr} width={dome.hero.width} height={dome.hero.height} loading="eager" decoding="async" fetchPriority="high"/></picture>:<Image className="home-hero-image" src={dome.hero.src} alt={dome.hero.alt[locale] ?? dome.hero.alt.fr} fill sizes="100vw" priority fetchPriority="high" quality={65} />}
        <div className="home-hero-shade" aria-hidden="true"/>
        <div className="hero-content page-container">
          <p className="eyebrow eyebrow--light hero-enter">{t.heroEyebrow}</p>
          <h1 id="home-title" className="hero-enter hero-enter--two">{t.heroTitle}</h1>
          <p className="hero-body hero-enter hero-enter--three">{t.heroBody}</p>
          <div className="hero-actions hero-enter hero-enter--four"><Link className="button button--light" href="#stays">{t.explore}<span aria-hidden="true">↗</span></Link><Link className="hero-secondary" href={`/${locale}/book`}>{bookingText[locale].title}<span aria-hidden="true">↗</span></Link></div>
        </div>
        <div className="hero-bottom page-container"><span>{t.brandSub}</span><a href="#intro">{t.scroll}<span aria-hidden="true">↓</span></a></div>
      </section>

      <section id="intro" className="intro-section section-pad page-container" data-reveal>
        <p className="eyebrow">{t.introEyebrow}</p>
        <div className="intro-grid"><h2 className="display-title">{t.introTitle}</h2><p className="intro-copy">{t.introBody}</p></div>
        <div className="intro-rule"><span>01</span><span aria-hidden="true">✳</span><span>02</span></div>
      </section>

      <section id="stays" className="stays-section">
        <div className="page-container"><p className="eyebrow stays-label">{t.staysEyebrow}</p></div>
        <article className="stay-feature stay-feature--dome page-container" data-reveal>
          <Link className="stay-card-link" href={`/${locale}/stays/dome`} aria-label={`${t.discover}: ${t.dome.label}`}/>
          <div className="stay-feature-visual"><div className="stay-main-image"><Image src={dome.photos[0].src} alt={dome.photos[0].alt[locale] ?? dome.photos[0].alt.fr} fill sizes="(max-width: 800px) 100vw, 55vw" /></div><div className="stay-inset-image"><Image src={dome.photos[3].src} alt={dome.photos[3].alt[locale] ?? dome.photos[3].alt.fr} fill sizes="(max-width: 800px) 40vw, 18vw" /></div></div>
          <div className="stay-feature-copy"><p className="eyebrow">{t.domeNumber}</p><h2>{t.domeTitle}</h2><p>{t.domeBody}</p><div className="feature-tags"><span>{t.dome.features[0]}</span><span>{t.dome.features[2]}</span></div><span className="text-link">{t.discover}<span aria-hidden="true">↗</span></span></div>
        </article>
      </section>

      <section className="cabin-wrap"><article className="stay-feature stay-feature--cabin page-container" data-reveal>
        <Link className="stay-card-link" href={`/${locale}/stays/cabin`} aria-label={`${t.discover}: ${t.cabin.label}`}/>
        <div className="stay-feature-copy"><p className="eyebrow eyebrow--light">{t.cabinNumber}</p><h2>{t.cabinTitle}</h2><p>{t.cabinBody}</p><div className="feature-tags"><span>{t.cabin.features[0]}</span><span>{t.cabin.features[2]}</span></div><span className="text-link text-link--light">{t.discover}<span aria-hidden="true">↗</span></span></div>
        <div className="stay-feature-visual"><div className="stay-main-image"><Image src={cabin.hero.src} alt={cabin.hero.alt[locale] ?? cabin.hero.alt.fr} fill sizes="(max-width: 800px) 100vw, 45vw" /></div><div className="stay-inset-image"><Image src={cabin.photos[5].src} alt={cabin.photos[5].alt[locale] ?? cabin.photos[5].alt.fr} fill sizes="(max-width: 800px) 40vw, 18vw" /></div></div>
      </article></section>

      {more.length>0&&<section className="more-stays section-pad page-container"><p className="eyebrow">{t.staysEyebrow}</p><h2 className="display-title">{t.navStays}</h2><div className="more-stays-grid">{more.map(item=><Link href={`/${locale}/stays/${item.slug}`} className="more-stay" key={item.slug}><div className="more-stay-image"><Image src={item.photo.src} alt={item.photo.alt} fill sizes="(max-width:700px) 90vw, 35vw"/></div><h3>{item.name}<span aria-hidden="true">↗</span></h3></Link>)}</div></section>}

      <section className="experience-section section-pad"><div className="page-container experience-grid">
        <div className="experience-copy" data-reveal><p className="eyebrow">{t.experienceEyebrow}</p><h2 className="display-title">{t.experienceTitle}</h2><p>{t.experienceBody}</p></div>
        <div className="experience-images" data-reveal><div className="experience-image experience-image--one"><Image src={dome.photos[2].src} alt={dome.photos[2].alt[locale] ?? dome.photos[2].alt.fr} fill sizes="(max-width: 800px) 55vw, 28vw" /></div><div className="experience-image experience-image--two"><Image src={cabin.photos[4].src} alt={cabin.photos[4].alt[locale] ?? cabin.photos[4].alt.fr} fill sizes="(max-width: 800px) 40vw, 17vw" /></div></div>
      </div></section>

      <section id="gallery" className="gallery-section section-pad"><div className="page-container"><div className="gallery-heading" data-reveal><div><p className="eyebrow">{t.galleryEyebrow}</p><h2 className="display-title">{t.galleryTitle}</h2></div><p>{t.galleryBody}</p></div><PhotoGallery photos={homeGallery} locale={locale}/></div></section>
      <Inquiry locale={locale}/>
    </main>
  </>;
}
