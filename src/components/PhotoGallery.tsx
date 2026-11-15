"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/content/stays";
import type { Locale } from "@/i18n";
import { getDictionary } from "@/i18n";

export function PhotoGallery({ photos, locale, variant = "grid" }: { photos: Photo[]; locale: Locale; variant?: "grid" | "detail" }) {
  const t = getDictionary(locale);
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const touchStart = useRef<number | null>(null);
  useEffect(() => {
    const node = dialog.current;
    if (active !== null && node && !node.open) { opener.current = document.activeElement as HTMLElement; node.showModal(); document.body.style.overflow = "hidden"; }
    if (active === null && node?.open) { node.close(); document.body.style.overflow = ""; opener.current?.focus(); }
  }, [active]);
  useEffect(() => () => { document.body.style.overflow = ""; }, []);
  const move = (delta: number) => setActive((current) => current === null ? null : (current + delta + photos.length) % photos.length);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); move(locale === "ar" ? -1 : 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(locale === "ar" ? 1 : -1); }
  };
  return <>
    <div className={`photo-grid photo-grid--${variant}`}>
      {photos.map((photo, index) => <button className="photo-tile" type="button" key={photo.src} onClick={() => setActive(index)} aria-label={`${t.viewPhoto}: ${photo.alt[locale] ?? photo.alt.fr}`}>
        <Image src={photo.src} width={photo.width} height={photo.height} alt={photo.alt[locale] ?? photo.alt.fr} sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 30vw" loading="lazy" />
      </button>)}
    </div>
    <dialog className="lightbox" ref={dialog} aria-label={t.galleryTitle} onClose={() => setActive(null)} onKeyDown={onKeyDown} onClick={(event) => { if (event.target === dialog.current) setActive(null); }} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStart.current === null) return; const delta = event.changedTouches[0]?.clientX - touchStart.current; if (Math.abs(delta) > 50) move(delta < 0 ? 1 : -1); touchStart.current = null; }}>
      {active !== null && <div className="lightbox-inner">
        <div className="lightbox-top"><span>{t.photoOf.replace("{current}", String(active + 1)).replace("{total}", String(photos.length))}</span><button type="button" className="lightbox-close" onClick={() => setActive(null)} aria-label={t.closeGallery}>×</button></div>
        <div className="lightbox-image"><Image src={photos[active].src} width={photos[active].width} height={photos[active].height} alt={photos[active].alt[locale] ?? photos[active].alt.fr} sizes="95vw" /></div>
        <div className="lightbox-bottom"><button type="button" onClick={() => move(-1)} aria-label={t.previousPhoto}>←</button><p>{photos[active].alt[locale] ?? photos[active].alt.fr}</p><button type="button" onClick={() => move(1)} aria-label={t.nextPhoto}>→</button></div>
      </div>}
    </dialog>
  </>;
}
