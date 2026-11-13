import "server-only";
import { db, databaseConfigured } from "./db";
import { stays, type Photo, type Stay, type StaySlug } from "@/content/stays";

export async function displayStay(slug: StaySlug): Promise<Stay> {
  const fallback = stays[slug];
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin || !databaseConfigured()) return fallback;
  try {
    const rows = await db()`select i.storage_path,i.alt_text,i.width,i.height,i.role from public.accommodation_images i
      join public.accommodation_types t on t.id=i.type_id where t.slug=${slug} and t.published order by i.sort_order,i.created_at`;
    if (!rows.length) return fallback;
    const managed: Photo[] = rows.map((row) => ({
      src: `${origin}/storage/v1/object/public/accommodation-images/${String(row.storage_path).split("/").map(encodeURIComponent).join("/")}`,
      width: row.width, height: row.height,
      alt: { fr: row.alt_text?.fr || fallback.hero.alt.fr, en: row.alt_text?.en || fallback.hero.alt.en, ar: row.alt_text?.ar || fallback.hero.alt.fr }
    }));
    const heroIndex = rows.findIndex(row => row.role === "hero");
    return { slug, hero: heroIndex >= 0 ? managed[heroIndex] : fallback.hero, photos: [...managed, ...fallback.photos] };
  } catch { return fallback; }
}
