import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL || "http://localhost:3000";
  return ["fr", "en", "ar"].flatMap((locale) => ["", "/stays/dome", "/stays/cabin"].map((path) => ({
    url: `${base}/${locale}${path}`,
    changeFrequency: "monthly" as const,
    priority: path ? 0.7 : 1
  })));
}
