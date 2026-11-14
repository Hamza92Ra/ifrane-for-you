import "server-only";
import { db, databaseConfigured } from "./db";
import { stays, type Photo, type Stay, type StaySlug } from "@/content/stays";

export async function displayStay(slug: StaySlug): Promise<Stay> {
  const fallback = stays[slug];
  if (!databaseConfigured()) return fallback;
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    const rows = await db()`select i.storage_path,i.alt_text,i.width,i.height,i.role from public.accommodation_images i
      join public.accommodation_types t on t.id=i.type_id where t.slug=${slug} and t.published order by i.sort_order,i.created_at`;
    if (!rows.length) return fallback;
    const managed: Photo[] = rows.map((row) => {
      const src = row.storage_path.startsWith("local:")
        ? `/${row.storage_path.replace(/^local:/, "")}`
        : `${origin}/storage/v1/object/public/accommodation-images/${String(row.storage_path).split("/").map(encodeURIComponent).join("/")}`;
      return {
        src,
        width: row.width,
        height: row.height,
        alt: {
          fr: row.alt_text?.fr || fallback.hero.alt.fr,
          en: row.alt_text?.en || fallback.hero.alt.en,
          ar: row.alt_text?.ar || fallback.hero.alt.ar || fallback.hero.alt.fr
        }
      };
    });
    const heroIndex = rows.findIndex((row) => row.role === "hero");
    const hero = heroIndex >= 0 ? managed[heroIndex] : managed[0];
    const gallery = managed.filter((_, idx) => idx !== (heroIndex >= 0 ? heroIndex : 0));
    return {
      slug,
      hero,
      photos: gallery.length > 0 ? gallery : [hero]
    };
  } catch {
    return fallback;
  }
}
