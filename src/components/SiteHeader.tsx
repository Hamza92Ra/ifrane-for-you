"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";
import { getDictionary, locales } from "@/i18n";
import { bookingText } from "@/i18n/booking";
import { persistLocale } from "@/i18n/persist";

export function SiteHeader({ locale, path = "/", overlay = false }: { locale: Locale; path?: string; overlay?: boolean }) {
  const t = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>50);onScroll();window.addEventListener("scroll",onScroll,{passive:true});return()=>window.removeEventListener("scroll",onScroll)},[]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[]);
  const base = `/${locale}`;
  const close = () => setOpen(false);
  const switchTo=(next:Locale)=>{persistLocale(next);close()};
  return <header className={`site-header ${overlay ? "site-header--overlay" : ""} ${scrolled ? "site-header--scrolled" : ""} ${open ? "site-header--open" : ""}`}>
    <div className="header-inner">
      <Link href={base} className="brand" onClick={close}>
        <span className="brand-mark">{t.brand}</span><span className="brand-sub">{t.brandSub}</span>
      </Link>
      <nav className={`main-nav ${open ? "main-nav--open" : ""}`} aria-label={t.menu}>
        <Link href={base} onClick={close}>{t.navHome}</Link>
        <Link href={`${base}/#stays`} onClick={close}>{t.navStays}</Link>
        <Link href={`${base}/#gallery`} onClick={close}>{t.navGallery}</Link>
        <Link href={`${base}/#inquire`} onClick={close}>{t.navContact}</Link>
        <Link href={`${base}/book`} onClick={close}>{bookingText[locale].title}</Link>
      </nav>
      <div className="header-actions">
        <div className="language-options" aria-label={t.switchLanguage}>{locales.map(next=><Link key={next} className={`language-link ${next===locale?"language-link--active":""}`} href={`/${next}${path}`} hrefLang={next} lang={next} aria-current={next===locale?"page":undefined} onClick={()=>switchTo(next)}>{next.toUpperCase()}</Link>)}</div>
        <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? t.close : t.menu} onClick={() => setOpen(!open)}><span/><span/></button>
      </div>
    </div>
    <div id="mobile-nav" className={`mobile-nav ${open ? "mobile-nav--open" : ""}`} aria-hidden={!open}>
      <Link href={base} onClick={close}>{t.navHome}</Link>
      <Link href={`${base}/#stays`} onClick={close}>{t.navStays}</Link>
      <Link href={`${base}/#gallery`} onClick={close}>{t.navGallery}</Link>
      <Link href={`${base}/#inquire`} onClick={close}>{t.navContact}</Link>
      <Link href={`${base}/book`} onClick={close}>{bookingText[locale].title}</Link>
    </div>
  </header>;
}
